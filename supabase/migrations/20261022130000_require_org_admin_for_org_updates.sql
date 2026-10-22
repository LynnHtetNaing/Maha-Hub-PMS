-- Require the shared organization-admin predicate for organization updates.
-- The previous policy included owner_user_id = auth.uid() as an independent
-- branch, which bypassed maha_owner_session_ok() and therefore bypassed the
-- owner MFA/AAL2 check for direct table updates.
DROP POLICY IF EXISTS maha_organizations_update_admin ON public.maha_organizations;

CREATE POLICY maha_organizations_update_admin
ON public.maha_organizations
FOR UPDATE
TO authenticated
USING (public.maha_is_org_admin(id))
WITH CHECK (public.maha_is_org_admin(id));
