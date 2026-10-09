// Supabase Edge Function: platform-admin-provision
// Owner-only provisioning for new hotel properties and staff accounts.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Never put the service-role key in the browser or a public repository.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://maha-hub.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "provisioning_not_configured" }, 503);

  const authorization = req.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "unauthorized" }, 401);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: callerError } = await authClient.auth.getUser(tokenMatch[1]);
  if (callerError || !caller.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner, error: ownerError } = await admin
    .from("maha_platform_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle();
  if (ownerError || !owner) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

  const organizationName = typeof body.organization_name === "string" ? body.organization_name.trim() : "";
  const propertyName = typeof body.property_name === "string" ? body.property_name.trim() : "";
  const propertyCode = typeof body.property_code === "string" ? body.property_code.trim().toUpperCase() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "property_admin" ? "property_admin" : "staff";

  if (organizationName.length < 2 || organizationName.length > 160 ||
      propertyName.length < 2 || propertyName.length > 160 ||
      !/^[A-Z0-9_-]{2,24}$/.test(propertyCode) ||
      !/^[A-Za-z0-9._-]{3,40}$/.test(username) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "invalid_fields" }, 400);
  }

  // A user invite is created first. If later provisioning fails, delete it to avoid
  // leaving an orphaned account. The invite email sets up access; passwords are not
  // accepted from the provider console and are never handled by this endpoint.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { maha_username: username },
  });
  if (inviteError || !invited.user) {
    return json({ error: "invite_failed" }, 400);
  }
  const userId = invited.user.id;
  let orgId: string | null = null;
  let propertyId: string | null = null;

  try {
    const { data: org, error: orgError } = await admin.from("maha_organizations")
      .insert({ name: organizationName, owner_user_id: caller.user.id }).select("id").single();
    if (orgError || !org) throw new Error("organization_create_failed");
    orgId = org.id;

    const { data: property, error: propertyError } = await admin.from("maha_properties")
      .insert({ organization_id: orgId, name: propertyName, property_code: propertyCode })
      .select("id").single();
    if (propertyError || !property) throw new Error("property_create_failed");
    propertyId = property.id;

    const { error: identityError } = await admin.from("maha_login_identities")
      .insert({ user_id: userId, username, recovery_email: email });
    if (identityError) throw new Error("username_create_failed");

    const { error: membershipError } = await admin.from("maha_memberships")
      .insert({ organization_id: orgId, property_id: propertyId, user_id: userId, role, active: true });
    if (membershipError) throw new Error("membership_create_failed");

    return json({ ok: true, organization_id: orgId, property_id: propertyId, username, role, invitation_sent: true }, 201);
  } catch {
    if (propertyId) await admin.from("maha_properties").delete().eq("id", propertyId);
    if (orgId) await admin.from("maha_organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "provisioning_failed" }, 400);
  }
});
