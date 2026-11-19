-- Maha Hub: remove the OLD whole-hotel passphrase sync (live project only has these).
--
-- Removed: maha_pull(), maha_push() and the table maha_cloud. Hotels now sync record by record with a
-- username sign-in (maha_sync_* functions), so nothing in the app calls these any more in sign-in mode.
-- Backup: the one maha_cloud row (a test hotel) is in the legacy-backup taken before the rollout.
--
-- KEPT on purpose: maha_secret, maha_check(), maha_init() and every maha_edc_* function. The EDC Card
-- Link feature (guest card links) authenticates with the same passphrase through maha_check(); removing
-- it would break EDC. (Moving EDC to username sign-in is a separate piece of work.)
--
-- Safe to run on any project: everything is "if exists".

begin;

drop function if exists public.maha_pull(text);
drop function if exists public.maha_push(text, jsonb, timestamp with time zone);
drop table if exists public.maha_cloud;

commit;
