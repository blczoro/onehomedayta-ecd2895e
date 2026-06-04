
-- Revoke public execute on all SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.space_role(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_edit_space(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_space_owner(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_space_invite(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_space_members(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_item_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_reminder_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_member_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_item_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_reminder_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_space_invite(text) FROM PUBLIC;

-- Grant execute where actually needed
GRANT EXECUTE ON FUNCTION public.is_space_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.space_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_space(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_space_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_space_invite(text) TO authenticated, anon;
