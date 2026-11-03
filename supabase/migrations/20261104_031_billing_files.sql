-- Maha Hub: files (PDF or photo) attached to a billing record.
--
-- The provider (platform admin) attaches and removes them. A hotel's people can only READ the files of their own
-- hotel, through a link that works for about one minute (made by the page when they click the download icon).
--   * Private storage area "billing-files": no public links. Only PDF, PNG and JPG, at most 5 MB each (the storage
--     area itself refuses anything else, whatever the page sends).
--   * At most 5 files per billing record (checked by the database).
--   * The first folder of every file path is the hotel's id, so one hotel can never reach another hotel's files.
-- NOT APPLIED YET. Run it on the staging project first, then on the main project, only after the owner says yes.
-- Needs 20261103_030_billing_records.sql first.

begin;

create table if not exists public.maha_billing_files (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.maha_billing_docs(id) on delete cascade,
  property_id uuid not null references public.maha_properties(id) on delete cascade,
  path text not null unique check (length(path) between 40 and 300),
  file_name text not null check (length(trim(file_name)) between 1 and 120),
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (path like property_id::text || '/%')
);
create index if not exists maha_billing_files_doc_idx on public.maha_billing_files(doc_id);
create index if not exists maha_billing_files_property_idx on public.maha_billing_files(property_id);
create index if not exists maha_billing_files_created_by_idx on public.maha_billing_files(created_by);

alter table public.maha_billing_files enable row level security;
revoke all on public.maha_billing_files from public, anon, authenticated;
grant select, insert, update, delete on public.maha_billing_files to authenticated;

drop policy if exists maha_billing_files_select on public.maha_billing_files;
create policy maha_billing_files_select on public.maha_billing_files for select to authenticated
using (public.maha_can_access_property(property_id) or public.maha_is_platform_admin());

drop policy if exists maha_billing_files_insert on public.maha_billing_files;
create policy maha_billing_files_insert on public.maha_billing_files for insert to authenticated
with check (public.maha_is_platform_admin());

drop policy if exists maha_billing_files_update on public.maha_billing_files;
create policy maha_billing_files_update on public.maha_billing_files for update to authenticated
using (public.maha_is_platform_admin()) with check (public.maha_is_platform_admin());

drop policy if exists maha_billing_files_delete on public.maha_billing_files;
create policy maha_billing_files_delete on public.maha_billing_files for delete to authenticated
using (public.maha_is_platform_admin());

-- The file must belong to the record, and the record to the same hotel; at most 5 files per record.
create or replace function public.maha_billing_files_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.maha_billing_docs d where d.id = new.doc_id and d.property_id = new.property_id) then
    raise exception 'billing-file-record-mismatch' using errcode = '23514';
  end if;
  if (select count(*) from public.maha_billing_files f where f.doc_id = new.doc_id) >= 5 then
    raise exception 'billing-file-limit' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.maha_billing_files_guard() from public, anon, authenticated;

drop trigger if exists maha_billing_files_guard_trg on public.maha_billing_files;
create trigger maha_billing_files_guard_trg before insert on public.maha_billing_files
for each row execute function public.maha_billing_files_guard();

-- May this person read the stored file at this path? (first folder = the hotel's id; a bad path is simply "no")
create or replace function public.maha_billing_file_readable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if first_folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.maha_is_platform_admin() or public.maha_can_access_property(first_folder::uuid);
end;
$$;
revoke all on function public.maha_billing_file_readable(text) from public, anon;
grant execute on function public.maha_billing_file_readable(text) to authenticated;

-- The private storage area and who may use it. Skipped where there is no Storage (the plain test database).
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('billing-files', 'billing-files', false, 5242880, array['application/pdf', 'image/png', 'image/jpeg'])
    on conflict (id) do update
      set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg'];

    drop policy if exists maha_billing_files_obj_select on storage.objects;
    create policy maha_billing_files_obj_select on storage.objects for select to authenticated
      using (bucket_id = 'billing-files' and public.maha_billing_file_readable(name));

    drop policy if exists maha_billing_files_obj_insert on storage.objects;
    create policy maha_billing_files_obj_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'billing-files' and public.maha_is_platform_admin());

    drop policy if exists maha_billing_files_obj_update on storage.objects;
    create policy maha_billing_files_obj_update on storage.objects for update to authenticated
      using (bucket_id = 'billing-files' and public.maha_is_platform_admin())
      with check (bucket_id = 'billing-files' and public.maha_is_platform_admin());

    drop policy if exists maha_billing_files_obj_delete on storage.objects;
    create policy maha_billing_files_obj_delete on storage.objects for delete to authenticated
      using (bucket_id = 'billing-files' and public.maha_is_platform_admin());
  end if;
end
$$;

commit;
