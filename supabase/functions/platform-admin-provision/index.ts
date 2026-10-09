// Supabase Edge Function: platform-admin-provision
// Owner-only provisioning of a hotel + its first staff account.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Keep this function JWT-protected. Never put service-role credentials in browser code.
//
// Order of operations (changed from v5 so a failure can never leave partial data):
//   1. create the auth user (confirmed, no email sent yet; fails if the email exists, so
//      a pre-existing account is never touched or deleted by the cleanup below)
//   2. maha_provision_hotel() writes organization/property/identity/membership in ONE
//      database transaction
//   3. only after that commits, send the set-password email
// If step 2 fails the auth user created in step 1 is deleted; no email has gone out.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("MAHA_ALLOWED_ORIGIN") || "https://maha-hub.com",
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

  const tokenMatch = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
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

  const requestedOrgId = typeof body.organization_id === "string" ? body.organization_id.trim() : "";
  const organizationName = typeof body.organization_name === "string" ? body.organization_name.trim() : "";
  const propertyName = typeof body.property_name === "string" ? body.property_name.trim() : "";
  const propertyCode = typeof body.property_code === "string" ? body.property_code.trim().toUpperCase() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "property_admin" ? "property_admin" : "staff";

  if ((!requestedOrgId && (organizationName.length < 2 || organizationName.length > 160)) ||
      (requestedOrgId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOrgId)) ||
      propertyName.length < 2 || propertyName.length > 160 ||
      !/^[A-Z0-9_-]{2,24}$/.test(propertyCode) ||
      !/^[A-Za-z0-9._-]{3,40}$/.test(username) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "invalid_fields" }, 400);
  }

  // Cheap pre-checks so common mistakes fail before any auth user is created.
  const { data: codeTaken } = await admin.from("maha_properties").select("id").eq("property_code", propertyCode).maybeSingle();
  if (codeTaken) return json({ error: "property_code_taken" }, 409);
  const { data: nameTaken } = await admin.from("maha_login_identities").select("user_id")
    .eq("username_normalized", username.toLowerCase()).maybeSingle();
  if (nameTaken) return json({ error: "username_taken" }, 409);

  // 1. Auth user. createUser fails if the email already exists: never reuse or delete one.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { maha_username: username },
  });
  if (createError || !created.user) return json({ error: "account_create_failed" }, 400);
  const userId = created.user.id;

  // 2. One transaction for all tenant rows.
  const { data: ids, error: provisionError } = await admin.rpc("maha_provision_hotel", {
    p_org_id: requestedOrgId || null,
    p_org_name: requestedOrgId ? null : organizationName,
    p_owner: caller.user.id,
    p_property_name: propertyName,
    p_property_code: propertyCode,
    p_user_id: userId,
    p_username: username,
    p_email: email,
    p_role: role,
  });
  if (provisionError || !ids) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    const status = provisionError?.code === "23505" ? 409 : provisionError?.code === "42501" ? 403 : 400;
    return json({
      error: provisionError?.code === "23505" ? "duplicate_property_or_username" : "provisioning_failed",
      cleanup_failed: deleteError ? true : undefined,
    }, status);
  }

  // 3. Set-password email only after everything committed. A failure here does not undo
  // the hotel; the owner can re-send through the username-auth password reset action.
  const { error: mailError } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: "https://maha-hub.com/reset-password",
  });

  return json({
    ok: true,
    organization_id: ids.organization_id,
    property_id: ids.property_id,
    username,
    role,
    invitation_sent: !mailError,
  }, 201);
});
