
-- =========================================================================
-- 1. PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing users
INSERT INTO public.profiles (id, display_name, email)
SELECT id,
       COALESCE(raw_user_meta_data->>'display_name', raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
       email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 2. SPACES + MEMBERS
-- =========================================================================
CREATE TABLE public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '🏠',
  description text,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spaces TO authenticated;
GRANT ALL ON public.spaces TO service_role;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_members TO authenticated;
GRANT ALL ON public.space_members TO service_role;
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_space_members_user ON public.space_members(user_id);
CREATE INDEX idx_space_members_space ON public.space_members(space_id);

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_space_member(_space_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.space_members WHERE space_id = _space_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.space_role(_space_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.space_members WHERE space_id = _space_id AND user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_space(_space_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = _space_id AND user_id = _user_id AND role IN ('owner','editor')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_space_owner(_space_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = _space_id AND user_id = _user_id AND role = 'owner'
  );
$$;

-- Spaces policies
CREATE POLICY "Members can view space" ON public.spaces
  FOR SELECT TO authenticated USING (public.is_space_member(id, auth.uid()));
CREATE POLICY "Users can create space" ON public.spaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update space" ON public.spaces
  FOR UPDATE TO authenticated USING (public.is_space_owner(id, auth.uid()));
CREATE POLICY "Owners can delete space" ON public.spaces
  FOR DELETE TO authenticated USING (public.is_space_owner(id, auth.uid()));

CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Space members policies
CREATE POLICY "Members can view co-members" ON public.space_members
  FOR SELECT TO authenticated USING (public.is_space_member(space_id, auth.uid()));
CREATE POLICY "Owner can add members" ON public.space_members
  FOR INSERT TO authenticated WITH CHECK (
    public.is_space_owner(space_id, auth.uid())
    OR auth.uid() = user_id  -- self-join via accept_invite RPC sets to caller
  );
CREATE POLICY "Owner can update member roles" ON public.space_members
  FOR UPDATE TO authenticated USING (public.is_space_owner(space_id, auth.uid()));
CREATE POLICY "Owner or self can remove member" ON public.space_members
  FOR DELETE TO authenticated USING (
    public.is_space_owner(space_id, auth.uid()) OR auth.uid() = user_id
  );

-- =========================================================================
-- 3. INVITES + JOIN REQUESTS
-- =========================================================================
CREATE TABLE public.space_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  role_on_accept text NOT NULL DEFAULT 'editor' CHECK (role_on_accept IN ('editor','viewer')),
  email text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_invites TO authenticated;
GRANT ALL ON public.space_invites TO service_role;
ALTER TABLE public.space_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invites" ON public.space_invites
  FOR SELECT TO authenticated USING (public.is_space_member(space_id, auth.uid()));
CREATE POLICY "Editors create invites" ON public.space_invites
  FOR INSERT TO authenticated WITH CHECK (
    public.can_edit_space(space_id, auth.uid()) AND auth.uid() = created_by
  );
CREATE POLICY "Owners revoke invites" ON public.space_invites
  FOR UPDATE TO authenticated USING (public.is_space_owner(space_id, auth.uid()));
CREATE POLICY "Owners delete invites" ON public.space_invites
  FOR DELETE TO authenticated USING (public.is_space_owner(space_id, auth.uid()));

-- Accept invite RPC (security definer so the caller can join without being a member yet)
CREATE OR REPLACE FUNCTION public.accept_space_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.space_invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_invite FROM public.space_invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF v_invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invite revoked'; END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;
  INSERT INTO public.space_members (space_id, user_id, role, invited_by)
  VALUES (v_invite.space_id, v_uid, v_invite.role_on_accept, v_invite.created_by)
  ON CONFLICT (space_id, user_id) DO NOTHING;
  RETURN v_invite.space_id;
END;
$$;

-- Public invite preview (returns space name/icon without requiring membership)
CREATE OR REPLACE FUNCTION public.preview_space_invite(_token text)
RETURNS TABLE (space_id uuid, name text, icon text, description text, role_on_accept text, is_valid boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.space_invites%ROWTYPE;
  v_space public.spaces%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.space_invites WHERE token = _token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, false, 'not_found'::text;
    RETURN;
  END IF;
  SELECT * INTO v_space FROM public.spaces WHERE id = v_invite.space_id;
  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT v_space.id, v_space.name, v_space.icon, v_space.description, v_invite.role_on_accept, false, 'revoked'::text;
    RETURN;
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN QUERY SELECT v_space.id, v_space.name, v_space.icon, v_space.description, v_invite.role_on_accept, false, 'expired'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT v_space.id, v_space.name, v_space.icon, v_space.description, v_invite.role_on_accept, true, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_space_invite(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_space_invite(text) TO authenticated;

-- =========================================================================
-- 4. ACTIVITY + NOTIFICATIONS
-- =========================================================================
CREATE TABLE public.space_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.space_activity TO authenticated;
GRANT ALL ON public.space_activity TO service_role;
ALTER TABLE public.space_activity ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_space_time ON public.space_activity(space_id, created_at DESC);

CREATE POLICY "Members view activity" ON public.space_activity
  FOR SELECT TO authenticated USING (public.is_space_member(space_id, auth.uid()));
CREATE POLICY "Members insert activity" ON public.space_activity
  FOR INSERT TO authenticated WITH CHECK (public.is_space_member(space_id, auth.uid()));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user_time ON public.notifications(user_id, created_at DESC);

CREATE POLICY "User views own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User updates own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User deletes own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (
    space_id IS NULL OR public.is_space_member(space_id, auth.uid())
  );

-- =========================================================================
-- 5. MIGRATE items + reminders TO space-scoped
-- =========================================================================
ALTER TABLE public.items ADD COLUMN space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE;
ALTER TABLE public.items ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.reminders ADD COLUMN space_id uuid REFERENCES public.spaces(id) ON DELETE CASCADE;
ALTER TABLE public.reminders ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: create a "Personal" space for every existing user
DO $$
DECLARE
  rec record;
  v_space_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.items
      UNION
      SELECT user_id FROM public.reminders
    ) u
  LOOP
    INSERT INTO public.spaces (owner_id, name, icon, description, is_shared)
    VALUES (rec.user_id, 'Personal', '🏠', 'Your personal space', false)
    RETURNING id INTO v_space_id;

    INSERT INTO public.space_members (space_id, user_id, role)
    VALUES (v_space_id, rec.user_id, 'owner');

    UPDATE public.items SET space_id = v_space_id WHERE user_id = rec.user_id AND space_id IS NULL;
    UPDATE public.reminders SET space_id = v_space_id WHERE user_id = rec.user_id AND space_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.items ALTER COLUMN space_id SET NOT NULL;
ALTER TABLE public.reminders ALTER COLUMN space_id SET NOT NULL;
CREATE INDEX idx_items_space ON public.items(space_id);
CREATE INDEX idx_reminders_space ON public.reminders(space_id);

-- Replace existing user_id-based RLS policies with space-membership policies
DROP POLICY IF EXISTS "Users can view own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert own items" ON public.items;
DROP POLICY IF EXISTS "Users can update own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.items;

CREATE POLICY "Members view items" ON public.items
  FOR SELECT TO authenticated USING (public.is_space_member(space_id, auth.uid()));
CREATE POLICY "Editors insert items" ON public.items
  FOR INSERT TO authenticated WITH CHECK (
    public.can_edit_space(space_id, auth.uid()) AND auth.uid() = user_id
  );
CREATE POLICY "Editors update items" ON public.items
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id, auth.uid()));
CREATE POLICY "Editors delete items" ON public.items
  FOR DELETE TO authenticated USING (public.can_edit_space(space_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;

CREATE POLICY "Members view reminders" ON public.reminders
  FOR SELECT TO authenticated USING (public.is_space_member(space_id, auth.uid()));
CREATE POLICY "Editors insert reminders" ON public.reminders
  FOR INSERT TO authenticated WITH CHECK (
    public.can_edit_space(space_id, auth.uid()) AND auth.uid() = user_id
  );
CREATE POLICY "Editors update reminders" ON public.reminders
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id, auth.uid()));
CREATE POLICY "Editors delete reminders" ON public.reminders
  FOR DELETE TO authenticated USING (public.can_edit_space(space_id, auth.uid()));

-- =========================================================================
-- 6. ACTIVITY TRIGGERS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.log_item_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (NEW.space_id, auth.uid(), 'item.created', 'item', NEW.id, jsonb_build_object('name', NEW.name, 'category', NEW.category));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (OLD.space_id, auth.uid(), 'item.deleted', 'item', OLD.id, jsonb_build_object('name', OLD.name));
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_item_activity
  AFTER INSERT OR DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.log_item_activity();

CREATE OR REPLACE FUNCTION public.log_reminder_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (NEW.space_id, auth.uid(), 'reminder.created', 'reminder', NEW.id, jsonb_build_object('title', NEW.title));
  ELSIF TG_OP = 'UPDATE' AND NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (NEW.space_id, auth.uid(), 'reminder.completed', 'reminder', NEW.id, jsonb_build_object('title', NEW.title));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (OLD.space_id, auth.uid(), 'reminder.deleted', 'reminder', OLD.id, jsonb_build_object('title', OLD.title));
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_reminder_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.log_reminder_activity();

CREATE OR REPLACE FUNCTION public.log_member_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (NEW.space_id, COALESCE(NEW.invited_by, NEW.user_id), 'member.joined', 'member', NEW.user_id,
            jsonb_build_object('name', v_name, 'role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.space_activity (space_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (OLD.space_id, auth.uid(), 'member.left', 'member', OLD.user_id, jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_member_activity
  AFTER INSERT OR DELETE ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.log_member_activity();

-- =========================================================================
-- 7. NOTIFICATIONS — fan out on item/reminder events
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_space_members(_space_id uuid, _exclude_user uuid, _type text, _title text, _body text, _entity_type text, _entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, space_id, type, title, body, entity_type, entity_id)
  SELECT user_id, _space_id, _type, _title, _body, _entity_type, _entity_id
  FROM public.space_members
  WHERE space_id = _space_id
    AND (_exclude_user IS NULL OR user_id <> _exclude_user);
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_item_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_space_members(NEW.space_id, auth.uid(), 'item.created',
    'New item: ' || NEW.name, NEW.category, 'item', NEW.id);
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, space_id, type, title, body, entity_type, entity_id)
    VALUES (NEW.assigned_to, NEW.space_id, 'item.assigned',
            'Assigned to you: ' || NEW.name, NEW.category, 'item', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_item_insert AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_item_insert();

CREATE OR REPLACE FUNCTION public.notify_on_reminder_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_space_members(NEW.space_id, auth.uid(), 'reminder.created',
      'New reminder: ' || NEW.title, NULL, 'reminder', NEW.id);
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, space_id, type, title, body, entity_type, entity_id)
      VALUES (NEW.assigned_to, NEW.space_id, 'reminder.assigned',
              'Assigned to you: ' || NEW.title, NULL, 'reminder', NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM public.notify_space_members(NEW.space_id, auth.uid(), 'reminder.completed',
      'Completed: ' || NEW.title, NULL, 'reminder', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_reminder_event AFTER INSERT OR UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reminder_event();

-- =========================================================================
-- 8. REALTIME
-- =========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.spaces;

ALTER TABLE public.items REPLICA IDENTITY FULL;
ALTER TABLE public.reminders REPLICA IDENTITY FULL;
ALTER TABLE public.space_members REPLICA IDENTITY FULL;
