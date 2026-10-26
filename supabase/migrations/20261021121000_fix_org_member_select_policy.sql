-- Correct organization SELECT membership predicate.
-- The previous policy compared m.organization_id to m.id, which could prevent
-- ordinary active members from reading their own organization row.
DROP POLICY IF EXISTS maha_organizations_select_member ON public.maha_organizations;

CREATE POLICY maha_organizations_select_member
ON public.maha_organizations
FOR SELECT
TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  OR public.maha_is_org_admin(id)
  OR EXISTS (
    SELECT 1
    FROM public.maha_memberships m
    WHERE m.organization_id = public.maha_organizations.id
      AND m.user_id = (SELECT auth.uid())
      AND m.active
  )
);
