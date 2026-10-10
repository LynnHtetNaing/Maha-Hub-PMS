// Supabase Edge Function: platform-admin-provision
// Provider-only (platform owner) account administration. Hotel managers and owners cannot call this:
// the caller must be listed in maha_platform_admins, and every staff action is limited to
// organizations that caller owns.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Keep this function JWT-protected. Never put service-role credentials in browser code.
//
// Actions (body.action; omitted = create_hotel):
//   create_hotel     organization_name|organization_id, property_name, property_code, username, email, role
//   add_staff        property_code, username, email, role
//   set_active       username, active (boolean)     - disables/enables sign-in immediately
//   reset_password   username                       - emails a set-password link to the staff member
//   rename_username  username, new_username
//
// Account creation order (so a failure never leaves partial data or a stray email):
//   1. create the auth user (confirmed, no email yet; fails if the email exists, so a pre-existing
//      account is never touched or deleted by the cleanup below)
//   2. one database transaction writes the tenant rows
//   3. only after that commits, send the set-password email
// If step 2 fails the auth user created in step 1 is deleted and no email has gone out.

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME = /^[A-Za-z0-9._-]{3,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[A-Z0-9_-]{2,24}$/;
const RESET_REDIRECT = "https://maha-hub.com/reset-password.html";

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
  const ownerId = caller.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = typeof body.action === "string" ? body.action : "create_hotel";
  const username = str("username");
  const email = str("email").toLowerCase();
  const role = body.role === "property_admin" ? "property_admin" : "staff";

  let mailError = "";   // reason the last email was refused (e.g. over_email_send_rate_limit); never includes addresses
  const sendSetPasswordEmail = async (to: string) => {
    const { error } = await authClient.auth.resetPasswordForEmail(to, { redirectTo: RESET_REDIRECT });
    mailError = error ? String((error as { code?: string }).code || error.status || "email_failed") : "";
    return !error;
  };
  const usernameTaken = async (name: string) => {
    const { data } = await admin.from("maha_login_identities").select("user_id")
      .eq("username_normalized", name.toLowerCase()).maybeSingle();
    return !!data;
  };
  // Creates the auth user, runs the DB step, and removes the auth user again if the DB step fails.
  const createAccountThen = async (
    runDb: (userId: string) => Promise<{ data: unknown; error: { code?: string } | null }>,
  ) => {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { maha_username: username },
    });
    if (createError || !created.user) return { ok: false as const, response: json({ error: "account_create_failed" }, 400) };
    const userId = created.user.id;
    const { data, error } = await runDb(userId);
    if (error || !data) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      const dup = error?.code === "23505";
      const denied = error?.code === "42501";
      return {
        ok: false as const,
        response: json({
          error: dup ? "duplicate_property_or_username" : denied ? "forbidden" : "provisioning_failed",
          cleanup_failed: deleteError ? true : undefined,
        }, dup ? 409 : denied ? 403 : 400),
      };
    }
    return { ok: true as const, userId, data };
  };

  // ---------------------------------------------------------------- create_hotel
  if (action === "create_hotel") {
    const requestedOrgId = str("organization_id");
    const organizationName = str("organization_name");
    const propertyName = str("property_name");
    const propertyCode = str("property_code").toUpperCase();
    if ((!requestedOrgId && (organizationName.length < 2 || organizationName.length > 160)) ||
        (requestedOrgId && !UUID.test(requestedOrgId)) ||
        propertyName.length < 2 || propertyName.length > 160 ||
        !CODE.test(propertyCode) || !USERNAME.test(username) || !EMAIL.test(email) || email.length > 254) {
      return json({ error: "invalid_fields" }, 400);
    }
    const { data: codeTaken } = await admin.from("maha_properties").select("id").eq("property_code", propertyCode).maybeSingle();
    if (codeTaken) return json({ error: "property_code_taken" }, 409);
    if (await usernameTaken(username)) return json({ error: "username_taken" }, 409);

    const result = await createAccountThen(async (userId) => {
      const r = await admin.rpc("maha_provision_hotel", {
        p_org_id: requestedOrgId || null,
        p_org_name: requestedOrgId ? null : organizationName,
        p_owner: ownerId,
        p_property_name: propertyName,
        p_property_code: propertyCode,
        p_user_id: userId,
        p_username: username,
        p_email: email,
        p_role: role,
      });
      return { data: r.data, error: r.error };
    });
    if (!result.ok) return result.response;
    const ids = result.data as { organization_id: string; property_id: string };
    return json({
      ok: true, organization_id: ids.organization_id, property_id: ids.property_id, username, role,
      invitation_sent: await sendSetPasswordEmail(email),
      invitation_error: mailError || undefined,
    }, 201);
  }

  // ---------------------------------------------------------------- add_staff
  if (action === "add_staff") {
    const propertyCode = str("property_code").toUpperCase();
    if (!CODE.test(propertyCode) || !USERNAME.test(username) || !EMAIL.test(email) || email.length > 254) {
      return json({ error: "invalid_fields" }, 400);
    }
    const { data: property } = await admin.from("maha_properties").select("id,organization_id")
      .eq("property_code", propertyCode).maybeSingle();
    if (!property) return json({ error: "property_not_found" }, 404);
    const { data: org } = await admin.from("maha_organizations").select("owner_user_id")
      .eq("id", property.organization_id).maybeSingle();
    if (!org || org.owner_user_id !== ownerId) return json({ error: "forbidden" }, 403);
    if (await usernameTaken(username)) return json({ error: "username_taken" }, 409);

    const result = await createAccountThen(async (userId) => {
      const r = await admin.rpc("maha_provision_staff", {
        p_property_id: property.id, p_owner: ownerId, p_user_id: userId,
        p_username: username, p_email: email, p_role: role,
      });
      return { data: r.data, error: r.error };
    });
    if (!result.ok) return result.response;
    const sent = await sendSetPasswordEmail(email);
    return json({ ok: true, property_id: property.id, username, role, invitation_sent: sent, invitation_error: mailError || undefined }, 201);
  }

  // ---------------------------------------------------------------- staff look-ups (all owner-scoped)
  if (action === "set_active" || action === "reset_password" || action === "rename_username") {
    if (!USERNAME.test(username)) return json({ error: "invalid_fields" }, 400);

    if (action === "reset_password") {
      const { data, error } = await admin.rpc("maha_owned_staff", { p_owner: ownerId, p_username: username });
      if (error || !data) return json({ error: "staff_not_found" }, 404);
      const sent = await sendSetPasswordEmail((data as { recovery_email: string }).recovery_email);
      return json({ ok: true, invitation_sent: sent, invitation_error: mailError || undefined });
    }

    if (action === "set_active") {
      if (typeof body.active !== "boolean") return json({ error: "invalid_fields" }, 400);
      const active = body.active as boolean;
      const { data: userId, error } = await admin.rpc("maha_set_staff_active", {
        p_owner: ownerId, p_username: username, p_active: active,
      });
      if (error || !userId) return json({ error: "staff_not_found" }, 404);
      // Database access is already cut or restored. The ban also stops token refresh and new sign-ins.
      const { error: banError } = await admin.auth.admin.updateUserById(userId as string, {
        ban_duration: active ? "none" : "876000h",
      });
      if (banError) return json({ error: "ban_update_failed", database_updated: true }, 502);
      return json({ ok: true, active });
    }

    const newUsername = str("new_username");
    if (!USERNAME.test(newUsername)) return json({ error: "invalid_fields" }, 400);
    if (await usernameTaken(newUsername)) return json({ error: "username_taken" }, 409);
    const { data: userId, error } = await admin.rpc("maha_rename_staff", {
      p_owner: ownerId, p_username: username, p_new_username: newUsername,
    });
    if (error || !userId) {
      return json({ error: error?.code === "23505" ? "username_taken" : "staff_not_found" }, error?.code === "23505" ? 409 : 404);
    }
    return json({ ok: true, username: newUsername });
  }

  return json({ error: "unsupported_action" }, 400);
});
