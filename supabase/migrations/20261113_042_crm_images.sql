-- Pictures for the Enewletter templates (the template designer of the CRM).
-- A public bucket, because an email must load its pictures from an open https address. Only the provider (CEO) and the sales team may add, change or
-- remove a picture; anyone with the exact address can see it (that is what a picture in an email is). Pictures only (png, jpeg, gif, webp), up to 3 MB each.
-- Skipped where there is no Storage (the plain test database). Needs 20261105_033_crm_team.sql first. Run on staging first, then live.

begin;

do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('crm-images', 'crm-images', true, 3145728, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    drop policy if exists maha_crm_images_obj_insert on storage.objects;
    create policy maha_crm_images_obj_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'crm-images' and (public.maha_is_platform_admin() or public.maha_is_crm_member()));

    drop policy if exists maha_crm_images_obj_update on storage.objects;
    create policy maha_crm_images_obj_update on storage.objects for update to authenticated
      using (bucket_id = 'crm-images' and (public.maha_is_platform_admin() or public.maha_is_crm_member()))
      with check (bucket_id = 'crm-images' and (public.maha_is_platform_admin() or public.maha_is_crm_member()));

    drop policy if exists maha_crm_images_obj_delete on storage.objects;
    create policy maha_crm_images_obj_delete on storage.objects for delete to authenticated
      using (bucket_id = 'crm-images' and (public.maha_is_platform_admin() or public.maha_is_crm_member()));
  end if;
end
$$;

commit;
