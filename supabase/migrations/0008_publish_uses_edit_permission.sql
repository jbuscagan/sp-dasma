-- =====================================================================
-- SAFE TO RUN AT ANY TIME. Run after 0007.
-- One permission per office: "Edit / delete / publish" (Admin › Offices & permissions).
-- Offices allowed to edit and delete published records may also publish the weekly list.
-- =====================================================================
create or replace function public.can_publish_week()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce((select can_edit_published from committees where id = public.my_committee()), false);
$$;
