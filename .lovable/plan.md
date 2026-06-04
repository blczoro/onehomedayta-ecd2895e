
# Spaces — Collaborative Asset Management

Transform the app from single-user to multi-user shared workspaces. Every item and reminder belongs to a Space; members of that Space see and manage the data based on their role.

## Scope (this iteration)

In:
- Spaces CRUD (private + shared), icon + description
- Membership with roles: owner / editor / viewer
- Invites via shareable link + email (request-to-join flow for links)
- Item + reminder ownership migrated from `user_id` to `space_id`
- Assignment of items/reminders to a specific member
- Activity feed per space
- In-app notifications (bell + unread count)
- Members directory page per space
- Space dashboard (counts: items, active/expired reminders, members)
- Realtime updates via Supabase Realtime on items, reminders, activity
- Space switcher in the sidebar; all existing pages scoped to current space
- RLS enforcement so non-members see nothing

Out (future):
- Email delivery of invites/notifications (only in-app for now)
- Username-based invites (link + email only; username requires a profile system upgrade)
- Profile pictures upload (use initials avatars; placeholder for future)
- Push/mobile notifications
- Shared document vault upload (documents already supported per item; no new bucket work)
- Granular per-item permissions beyond role

## Data model

New tables (all in `public`, with GRANTs + RLS):

```text
spaces
  id, owner_id, name, icon, description, is_shared, created_at, updated_at

space_members
  id, space_id, user_id, role ('owner'|'editor'|'viewer'),
  invited_by, joined_at, created_at
  UNIQUE(space_id, user_id)

space_invites
  id, space_id, token (unique), created_by, role_on_accept,
  email (nullable), expires_at, revoked_at, created_at

space_join_requests
  id, space_id, user_id, invite_id, status ('pending'|'approved'|'rejected'),
  created_at, decided_at, decided_by

space_activity
  id, space_id, actor_id, action (text), entity_type, entity_id,
  metadata jsonb, created_at

notifications
  id, user_id, space_id, type, title, body, entity_type, entity_id,
  read_at, created_at

profiles  (new — minimal)
  id (= auth.uid()), display_name, email, created_at, updated_at
  trigger: insert on auth.users -> create profile row
```

Migrate existing tables:
- `items`: add `space_id uuid not null`, `assigned_to uuid null`. Backfill: create one "Personal" space per existing user_id and assign all their items to it.
- `reminders`: add `space_id uuid not null`, `assigned_to uuid null`. Same backfill.
- Keep `user_id` columns (= creator) for audit, but RLS pivots to `space_id` membership.

### RLS helpers (security definer, avoids recursion)

```sql
is_space_member(_space_id, _user_id) returns bool
space_role(_space_id, _user_id) returns text
can_edit_space(_space_id, _user_id) returns bool  -- owner|editor
```

### Policies (summary)
- spaces: select if member; insert if auth.uid() = owner_id; update/delete owner only
- space_members: select if member of same space; mutations owner only (self can delete to leave)
- items/reminders: select if member; insert/update/delete if can_edit; viewers select-only
- space_activity: select if member; insert by member (server writes via triggers)
- notifications: select/update own only
- invites: select if member; insert if can_edit; accept via SECURITY DEFINER RPC

### Activity automation
DB triggers on `items`, `reminders`, `space_members`, `reminder_completions` insert rows into `space_activity` with the right action label. Cheaper and tamper-resistant vs client writes.

### Realtime
Add to `supabase_realtime` publication: `items`, `reminders`, `space_activity`, `notifications`, `space_members`.

## UI changes

### Space switcher
- Top of sidebar: dropdown showing current space (icon + name) with "Manage spaces" + "Create space" actions.
- Persist current `space_id` in `localStorage` and a React context (`useCurrentSpace`).
- All existing pages (`dashboard`, `add-item`, `my-items`, `reminders`) filter by current space.

### New routes
- `/_authenticated/spaces` — list of user's spaces, create new
- `/_authenticated/spaces/$id` — space dashboard (counts + recent activity)
- `/_authenticated/spaces/$id/members` — members directory + invite UI
- `/_authenticated/spaces/$id/activity` — full activity feed
- `/_authenticated/spaces/$id/settings` — rename, change icon, delete, leave
- `/invite/$token` — public route; if logged out, redirect to login then back; otherwise show "Join {Space}" + role preview + accept button

### Item/Reminder forms
- Add "Assign to" select (members of current space, optional)
- Hidden `space_id` = current space

### Members directory
- Avatar (initials), name, email, role badge, counts of assigned items/reminders
- Owner can change roles / remove members
- "Leave space" button for non-owners

### Notifications
- Bell icon in top header with unread badge
- Dropdown listing recent notifications; click marks read + navigates to entity
- Triggered server-side (DB triggers fan out a notification per member on key events)

### Activity feed
- Per-space chronological list grouped by day
- Row: `{actor} {action} {entity}` + relative time

## Server functions (createServerFn)

- `createSpace({ name, icon, description, is_shared })`
- `createInvite({ space_id, role, email? })` returns token + URL
- `acceptInvite({ token })` — SECURITY DEFINER RPC under the hood
- `requestJoin({ token })` for link-only request flow
- `decideJoinRequest({ id, approve })`
- `updateMemberRole({ space_id, user_id, role })`
- `removeMember({ space_id, user_id })`
- `leaveSpace({ space_id })`
- `markNotificationRead({ id })` / `markAllRead({ space_id? })`

Existing item/reminder server actions stay in `src/lib/items.ts` etc.; we add space scoping there.

## Migration strategy for existing data

In the same migration:
1. Create `profiles` and backfill from `auth.users`.
2. Create `spaces`, `space_members`, etc.
3. For each distinct `user_id` in `items` + `reminders`, create a "Personal" space, add user as owner member.
4. Add `space_id` + `assigned_to` columns, populate from the user's personal space.
5. Set NOT NULL, add FK + indexes.
6. Replace RLS policies on `items` / `reminders` with membership-based ones.
7. Enable realtime publication.

Zero data loss — every existing item/reminder lands in its owner's "Personal" space.

## Risks / notes
- Big migration; will run inside one transaction.
- Existing pages need a `space_id` context wired before they'll show data again after the migration, so the space context + switcher ship in the same change.
- Public `/invite/$token` route stays top-level (not under `_authenticated`) and gates sign-in itself.
- No `username` field on profiles this round — invite by username is deferred.

## Rollout in this turn
1. Run the schema migration (creates tables, helpers, triggers, RLS, backfill, realtime).
2. After approval, build: space context + switcher, spaces routes, members + invites, activity feed, notifications bell, assignment selectors, scoped queries on existing pages.
