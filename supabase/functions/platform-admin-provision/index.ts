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
//   delete_hotel     property_code                  - moves the hotel to the Recycle bin (30 days) and locks its staff out
//   restore_hotel    property_code                  - brings it back (only within the 30 days)
//   purge_hotel      property_code                  - erases a hotel that is in the Recycle bin, with its staff logins
//   purge_expired    (nothing)                      - erases every hotel whose 30 days are over
//   create_chain     chain_name, chain_code         - a company that holds several hotels (code: 6-12 letters/numbers, unique)
//   rename_chain     chain_code, chain_name
//   move_hotel       property_code, chain_code      - into a chain; an empty chain_code makes the hotel stand-alone
//   set_access       username, property_code, allowed (boolean), role - which hotels one person may open (same chain only)
//   set_invoice_scope chain_code, scope ("hotel" = one tax-invoice series per hotel, "chain" = one series for the whole chain)
//   set_invoice_format property_code, mode ("standard"|"manual"), and for manual: prefix, start, min_digits, unlimited - the Tax Invoice Reference of one hotel
//                    (for a hotel in a chain with one series the format is kept for the whole chain)
//   change_staff_email username, new_email - the sign-in code and password-reset emails go to the new address; forgets trusted devices
//   forget_devices    username                       - the person is asked for a new sign-in code on every device
//   staff_signin_list property_code                  - staff of one hotel: masked email and the date of the last code check
//   (create_hotel also accepts chain_code: the new hotel joins that chain)
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

// Reads one claim from a JWT. The token was already verified by Supabase Auth (getUser) before this is used.
function jwtClaim(token: string, name: string): string {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return String(JSON.parse(atob(padded))[name] ?? "");
  } catch {
    return "";
  }
}

// The browser sends the address of the page it came from. Only the addresses listed here are answered with that address;
// MAHA_ALLOWED_ORIGIN (comma separated) may add more. The PMS has its own address, pms.maha-hub.com.
const ALLOWED_ORIGINS = [...new Set([
  "https://maha-hub.com", "https://www.maha-hub.com", "https://pms.maha-hub.com",
  ...(Deno.env.get("MAHA_ALLOWED_ORIGIN") || "").split(",").map((x) => x.trim()).filter(Boolean),
])];
const withOrigin = (req: Request, res: Response): Response => {
  const origin = req.headers.get("Origin") || "";
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  h.append("Vary", "Origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};

const handle = async (req: Request): Promise<Response> => {
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

  // Activity log (server-side, permanent). Logging is best effort: it can never break a request.
  const track = (p: Promise<unknown>) => {
    try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
  };
  const { data: me } = await admin.from("maha_login_identities").select("username").eq("user_id", ownerId).maybeSingle();
  const actorName = (me as { username?: string } | null)?.username ?? "provider";
  const audit = (event: string, target: string | null, property: string | null, ok: boolean, detail: string | null) =>
    Promise.resolve(admin.rpc("maha_log_event", {
      p_actor_user: ownerId, p_actor_username: actorName, p_event: event, p_target: target,
      p_property_code: property, p_ok: ok, p_detail: detail,
    })).catch(() => undefined);
  // Two-factor gate: the provider must have an authenticator enrolled AND have passed the 6-digit step in this session.
  const { data: hasMfa, error: mfaError } = await admin.rpc("maha_has_verified_mfa", { p_user: ownerId });
  if (mfaError) return json({ error: "mfa_check_failed" }, 502);
  if (!hasMfa) { track(audit("mfa_blocked", null, null, false, "mfa_enrollment_required")); return json({ error: "mfa_enrollment_required" }, 403); }
  if (jwtClaim(tokenMatch[1], "aal") !== "aal2") { track(audit("mfa_blocked", null, null, false, "mfa_required")); return json({ error: "mfa_required" }, 403); }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = typeof body.action === "string" ? body.action : "create_hotel";
  const username = str("username");
  const email = str("email").toLowerCase();
  const role = body.role === "property_admin" ? "property_admin" : "staff";

  // Every answer below goes through respond(): it writes the activity-log entry, then returns the response.
  const respond = (resBody: unknown, status = 200): Response => {
    try {
      const b = (resBody ?? {}) as Record<string, unknown>;
      const ok = status < 400;
      const err = typeof b.error === "string" ? b.error : "";
      const property = str("property_code").toUpperCase() || null;
      const target = action === "rename_username" ? `${username}>${str("new_username")}`
        : ["create_hotel", "delete_hotel", "restore_hotel", "purge_hotel", "set_invoice_format"].includes(action) ? property
        : ["create_chain", "rename_chain", "set_invoice_scope"].includes(action) ? str("chain_code").toUpperCase()
        : action === "move_hotel" ? property
        : action === "set_access" ? `${username}@${property ?? ""}`
        : action === "purge_expired" ? null : username;
      let event = "";
      let detail = ok ? "" : err;
      if (action === "create_hotel") event = ok ? "hotel_created" : "hotel_create_failed";
      else if (action === "add_staff") event = ok ? "staff_added" : "staff_add_failed";
      else if (action === "set_active") event = ok ? (b.active ? "staff_enabled" : "staff_disabled") : "staff_status_failed";
      else if (action === "reset_password") event = ok ? "password_reset_sent" : "password_reset_failed";
      else if (action === "rename_username") event = ok ? "username_changed" : "username_change_failed";
      else if (action === "delete_hotel") event = ok ? "hotel_deleted" : "hotel_delete_failed";
      else if (action === "restore_hotel") event = ok ? "hotel_restored" : "hotel_restore_failed";
      else if (action === "purge_hotel") event = ok ? "hotel_purged" : "hotel_purge_failed";
      else if (action === "purge_expired") event = ok ? "expired_hotels_purged" : "expired_purge_failed";
      else if (action === "create_chain") event = ok ? "chain_created" : "chain_create_failed";
      else if (action === "rename_chain") event = ok ? "chain_renamed" : "chain_rename_failed";
      else if (action === "move_hotel") event = ok ? "hotel_moved" : "hotel_move_failed";
      else if (action === "set_invoice_scope") event = ok ? "invoice_series_changed" : "invoice_series_change_failed";
      else if (action === "set_invoice_format") event = ok ? "invoice_format_changed" : "invoice_format_change_failed";
      else if (action === "set_access") event = ok ? (b.allowed ? "hotel_access_granted" : "hotel_access_removed") : "hotel_access_failed";
      else if (action === "change_staff_email") event = ok ? "staff_email_changed" : "staff_email_change_failed";   // the address itself is never logged
      else if (action === "forget_devices") event = ok ? "trusted_devices_reset" : "trusted_devices_reset_failed";
      if (ok && b.invitation_sent === false) detail = "email not sent: " + String(b.invitation_error ?? "");
      if (ok && action === "create_hotel") detail = (detail ? detail + "; " : "") + "owner " + username;
      if (ok && action === "set_invoice_scope") detail = b.invoice_scope === "chain" ? "one series for the whole chain" : "one series per hotel";
      if (ok && action === "set_invoice_format") detail = b.invoice_mode === "manual" ? "Manual" : "Standard";
      if (ok && action === "move_hotel") detail = "to " + (str("chain_code").toUpperCase() || "stand-alone");
      if (event) track(audit(event, target, property, ok, detail || null));
    } catch { /* logging must never break the request */ }
    return json(resBody, status);
  };

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
    let requestedOrgId = str("organization_id");
    const chainCode = str("chain_code").toUpperCase();
    if (chainCode) {
      // the new hotel joins an existing chain of this provider
      const { data: chain } = await admin.from("maha_organizations").select("id,owner_user_id").eq("chain_code", chainCode).maybeSingle();
      if (!chain || chain.owner_user_id !== ownerId) return respond({ error: "chain_not_found" }, 404);
      requestedOrgId = chain.id as string;
    }
    const organizationName = str("organization_name");
    const propertyName = str("property_name");
    const propertyCode = str("property_code").toUpperCase();
    if ((!requestedOrgId && (organizationName.length < 2 || organizationName.length > 160)) ||
        (requestedOrgId && !UUID.test(requestedOrgId)) ||
        propertyName.length < 2 || propertyName.length > 160 ||
        !CODE.test(propertyCode) || !USERNAME.test(username) || !EMAIL.test(email) || email.length > 254) {
      return respond({ error: "invalid_fields" }, 400);
    }
    const { data: codeTaken } = await admin.from("maha_properties").select("id").eq("property_code", propertyCode).maybeSingle();
    if (codeTaken) return respond({ error: "property_code_taken" }, 409);
    if (await usernameTaken(username)) return respond({ error: "username_taken" }, 409);

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
    return respond({
      ok: true, organization_id: ids.organization_id, property_id: ids.property_id, username, role,
      invitation_sent: await sendSetPasswordEmail(email),
      invitation_error: mailError || undefined,
    }, 201);
  }

  // ---------------------------------------------------------------- add_staff
  if (action === "add_staff") {
    const propertyCode = str("property_code").toUpperCase();
    if (!CODE.test(propertyCode) || !USERNAME.test(username) || !EMAIL.test(email) || email.length > 254) {
      return respond({ error: "invalid_fields" }, 400);
    }
    const { data: property } = await admin.from("maha_properties").select("id,organization_id")
      .eq("property_code", propertyCode).maybeSingle();
    if (!property) return respond({ error: "property_not_found" }, 404);
    const { data: org } = await admin.from("maha_organizations").select("owner_user_id")
      .eq("id", property.organization_id).maybeSingle();
    if (!org || org.owner_user_id !== ownerId) return respond({ error: "forbidden" }, 403);
    if (await usernameTaken(username)) return respond({ error: "username_taken" }, 409);

    const result = await createAccountThen(async (userId) => {
      const r = await admin.rpc("maha_provision_staff", {
        p_property_id: property.id, p_owner: ownerId, p_user_id: userId,
        p_username: username, p_email: email, p_role: role,
      });
      return { data: r.data, error: r.error };
    });
    if (!result.ok) return result.response;
    const sent = await sendSetPasswordEmail(email);
    return respond({ ok: true, property_id: property.id, username, role, invitation_sent: sent, invitation_error: mailError || undefined }, 201);
  }

  // ---------------------------------------------------------------- staff look-ups (all owner-scoped)
  if (action === "set_active" || action === "reset_password" || action === "rename_username") {
    if (!USERNAME.test(username)) return respond({ error: "invalid_fields" }, 400);

    if (action === "reset_password") {
      const { data, error } = await admin.rpc("maha_owned_staff", { p_owner: ownerId, p_username: username });
      if (error || !data) return respond({ error: "staff_not_found" }, 404);
      const sent = await sendSetPasswordEmail((data as { recovery_email: string }).recovery_email);
      return respond({ ok: true, invitation_sent: sent, invitation_error: mailError || undefined });
    }

    if (action === "set_active") {
      if (typeof body.active !== "boolean") return respond({ error: "invalid_fields" }, 400);
      const active = body.active as boolean;
      const { data: userId, error } = await admin.rpc("maha_set_staff_active", {
        p_owner: ownerId, p_username: username, p_active: active,
      });
      if (error || !userId) return respond({ error: "staff_not_found" }, 404);
      // Database access is already cut or restored. The ban also stops token refresh and new sign-ins.
      const { error: banError } = await admin.auth.admin.updateUserById(userId as string, {
        ban_duration: active ? "none" : "876000h",
      });
      if (banError) return respond({ error: "ban_update_failed", database_updated: true }, 502);
      return respond({ ok: true, active });
    }

    const newUsername = str("new_username");
    if (!USERNAME.test(newUsername)) return respond({ error: "invalid_fields" }, 400);
    if (await usernameTaken(newUsername)) return respond({ error: "username_taken" }, 409);
    const { data: userId, error } = await admin.rpc("maha_rename_staff", {
      p_owner: ownerId, p_username: username, p_new_username: newUsername,
    });
    if (error || !userId) {
      return respond({ error: error?.code === "23505" ? "username_taken" : "staff_not_found" }, error?.code === "23505" ? 409 : 404);
    }
    return respond({ ok: true, username: newUsername });
  }

  // ---------------------------------------------------------------- Sign-in security (all owner-scoped)
  if (action === "change_staff_email" || action === "forget_devices" || action === "staff_signin_list") {
    const signinError = (e: { code?: string; message?: string } | null) => {
      const m = String(e?.message ?? "");
      if (m.includes("invalid-email")) return respond({ error: "invalid_email" }, 400);
      if (m.includes("email-taken") || e?.code === "23505") return respond({ error: "email_taken" }, 409);
      if (m.includes("staff-not-found") || e?.code === "P0002") return respond({ error: "staff_not_found" }, 404);
      if (m.includes("property-not-owned") || m.includes("not-allowed") || e?.code === "42501") return respond({ error: "forbidden" }, 403);
      return respond({ error: "signin_failed" }, 502);
    };

    if (action === "staff_signin_list") {
      const code = str("property_code").toUpperCase();
      if (!CODE.test(code)) return respond({ error: "invalid_fields" }, 400);
      const { data: hotel } = await admin.from("maha_properties").select("id").eq("property_code", code).maybeSingle();
      if (!hotel) return respond({ error: "property_not_found" }, 404);
      const { data, error } = await admin.rpc("maha_staff_signin_overview", { p_owner: ownerId, p_property_id: hotel.id });
      if (error) return signinError(error);
      return respond({ ok: true, staff: Array.isArray(data) ? data : [] });
    }

    if (!USERNAME.test(username)) return respond({ error: "invalid_fields" }, 400);

    if (action === "forget_devices") {
      const { data: staff, error: staffError } = await admin.rpc("maha_owned_staff", { p_owner: ownerId, p_username: username });
      const staffId = (staff as { user_id?: string } | null)?.user_id;
      if (staffError || !staffId) return signinError(staffError ?? { message: "staff-not-found" });
      const { data: forgotten, error } = await admin.rpc("maha_reset_trusted_devices", { p_user: staffId });
      if (error) return signinError(error);
      return respond({ ok: true, devices_forgotten: Number(forgotten) || 0 });
    }

    // change_staff_email
    const newEmail = str("new_email").toLowerCase();
    if (!EMAIL.test(newEmail) || newEmail.length > 254) return respond({ error: "invalid_email" }, 400);
    // 1. the database checks everything and, in one transaction, writes the new address, forgets the trusted devices and ends the sessions
    const { data: changed, error: changeError } = await admin.rpc("maha_change_staff_email", {
      p_owner: ownerId, p_username: username, p_new_email: newEmail,
    });
    if (changeError || !changed) return signinError(changeError);
    const done = changed as { user_id: string; old_email: string; masked_new: string };
    // 2. the sign-in account (Supabase Auth) gets the same address; if that fails the old address is put back, so nothing stays half-changed
    const { error: authError } = await admin.auth.admin.updateUserById(done.user_id, { email: newEmail, email_confirm: true });
    if (authError) {
      const { error: revertError } = await admin.rpc("maha_change_staff_email", {
        p_owner: ownerId, p_username: username, p_new_email: done.old_email,
      });
      const taken = String((authError as { code?: string }).code ?? "") === "email_exists";
      return respond({ error: taken ? "email_taken" : "email_update_failed", reverted: revertError ? false : true }, taken ? 409 : 502);
    }
    return respond({ ok: true, masked_email: done.masked_new });
  }

  // ---------------------------------------------------------------- Recycle bin
  if (action === "delete_hotel" || action === "restore_hotel" || action === "purge_hotel" || action === "purge_expired") {
    const lockAccounts = async (ids: unknown, ban: boolean) => {
      let failed = 0;
      for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id !== "string" || !UUID.test(id)) continue;
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ban ? "876000h" : "none" });
        if (error) failed++;
      }
      return failed;
    };
    const removeAccounts = async (ids: unknown) => {
      let removed = 0;
      let failed = 0;
      for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id !== "string" || !UUID.test(id)) continue;
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) failed++; else removed++;
      }
      return { removed, failed };
    };
    const recycleError = (e: { code?: string; message?: string } | null) => {
      const m = String(e?.message ?? "");
      if (m.includes("already-deleted")) return respond({ error: "already_deleted" }, 409);
      if (m.includes("not-restorable")) return respond({ error: "not_restorable" }, 409);
      if (m.includes("not-deleted")) return respond({ error: "not_deleted" }, 409);
      if (e?.code === "42501") return respond({ error: "forbidden" }, 403);
      return respond({ error: "recycle_failed" }, 502);
    };

    if (action === "purge_expired") {
      const { data: expired, error: expiredError } = await admin.rpc("maha_recycle_expired", { p_owner: ownerId });
      if (expiredError) return recycleError(expiredError);
      let purged = 0;
      let accountsFailed = 0;
      for (const id of Array.isArray(expired) ? expired : []) {
        if (typeof id !== "string" || !UUID.test(id)) continue;
        const { data, error } = await admin.rpc("maha_purge_hotel", { p_owner: ownerId, p_property_id: id });
        if (error || !data) continue;
        purged++;
        accountsFailed += (await removeAccounts((data as { orphan_user_ids?: unknown }).orphan_user_ids)).failed;
      }
      return respond({ ok: true, purged, cleanup_failed: accountsFailed > 0 ? true : undefined });
    }

    const code = str("property_code").toUpperCase();
    if (!CODE.test(code)) return respond({ error: "invalid_fields" }, 400);
    const { data: hotel } = await admin.from("maha_properties").select("id,organization_id")
      .eq("property_code", code).maybeSingle();
    if (!hotel) return respond({ error: "property_not_found" }, 404);
    const { data: hotelOrg } = await admin.from("maha_organizations").select("owner_user_id")
      .eq("id", hotel.organization_id).maybeSingle();
    if (!hotelOrg || hotelOrg.owner_user_id !== ownerId) return respond({ error: "forbidden" }, 403);

    if (action === "delete_hotel") {
      const { data, error } = await admin.rpc("maha_recycle_hotel", { p_owner: ownerId, p_property_id: hotel.id, p_days: 30 });
      if (error || !data) return recycleError(error);
      const r = data as { purge_at?: string; staff_user_ids?: unknown };
      // Database access is already cut for everyone. The ban also stops new sign-ins and token refresh.
      const failed = await lockAccounts(r.staff_user_ids, true);
      return respond({ ok: true, purge_at: r.purge_at, lockout_incomplete: failed > 0 ? true : undefined });
    }
    if (action === "restore_hotel") {
      const { data, error } = await admin.rpc("maha_restore_hotel", { p_owner: ownerId, p_property_id: hotel.id });
      if (error || !data) return recycleError(error);
      const failed = await lockAccounts((data as { staff_user_ids?: unknown }).staff_user_ids, false);
      return respond({ ok: true, unlock_incomplete: failed > 0 ? true : undefined });
    }
    const { data, error } = await admin.rpc("maha_purge_hotel", { p_owner: ownerId, p_property_id: hotel.id });
    if (error || !data) return recycleError(error);
    const gone = await removeAccounts((data as { orphan_user_ids?: unknown }).orphan_user_ids);
    return respond({ ok: true, accounts_removed: gone.removed, cleanup_failed: gone.failed > 0 ? true : undefined });
  }

  // ---------------------------------------------------------------- Chains (groups of hotels)
  if (action === "create_chain" || action === "rename_chain" || action === "move_hotel" || action === "set_access" || action === "set_invoice_scope") {
    const chainError = (e: { code?: string; message?: string } | null) => {
      const m = String(e?.message ?? "");
      if (e?.code === "23505") return respond({ error: "chain_code_taken" }, 409);
      if (m.includes("invalid-chain") || m.includes("invalid-scope")) return respond({ error: "invalid_fields" }, 400);
      if (m.includes("chain-not-found")) return respond({ error: "chain_not_found" }, 404);
      if (m.includes("shared-staff")) return respond({ error: "staff_shared" }, 409);
      if (m.includes("same-chain")) return respond({ error: "already_there" }, 409);
      if (m.includes("hotel-deleted")) return respond({ error: "hotel_deleted" }, 409);
      if (m.includes("different-chain")) return respond({ error: "different_chain" }, 409);
      if (m.includes("property-not-owned")) return respond({ error: "property_not_found" }, 404);
      if (m.includes("staff-not-found") || e?.code === "P0002") return respond({ error: "staff_not_found" }, 404);
      if (e?.code === "42501") return respond({ error: "forbidden" }, 403);
      return respond({ error: "chain_failed" }, 502);
    };
    const chainCode = str("chain_code").toUpperCase();
    const CHAIN = /^[A-Z0-9]{6,12}$/;
    const chainOf = async (code: string) => {
      const { data } = await admin.from("maha_organizations").select("id,owner_user_id").eq("chain_code", code).maybeSingle();
      return data && data.owner_user_id === ownerId ? (data.id as string) : null;
    };
    const hotelOf = async (code: string) => {
      const { data: hotel } = await admin.from("maha_properties").select("id,organization_id").eq("property_code", code).maybeSingle();
      if (!hotel) return null;
      const { data: org } = await admin.from("maha_organizations").select("owner_user_id").eq("id", hotel.organization_id).maybeSingle();
      return org && org.owner_user_id === ownerId ? (hotel.id as string) : null;
    };

    if (action === "create_chain") {
      const name = str("chain_name");
      if (name.length < 2 || name.length > 160 || !CHAIN.test(chainCode)) return respond({ error: "invalid_fields" }, 400);
      const { data, error } = await admin.rpc("maha_create_chain", { p_owner: ownerId, p_name: name, p_code: chainCode });
      if (error || !data) return chainError(error);
      return respond({ ok: true, ...(data as Record<string, unknown>) }, 201);
    }
    if (action === "rename_chain") {
      const name = str("chain_name");
      if (name.length < 2 || name.length > 160 || !CHAIN.test(chainCode)) return respond({ error: "invalid_fields" }, 400);
      const org = await chainOf(chainCode);
      if (!org) return respond({ error: "chain_not_found" }, 404);
      const { data, error } = await admin.rpc("maha_rename_chain", { p_owner: ownerId, p_org: org, p_name: name });
      if (error || !data) return chainError(error);
      return respond({ ok: true });
    }
    if (action === "set_invoice_scope") {
      const scope = str("scope");
      if (!CHAIN.test(chainCode) || (scope !== "hotel" && scope !== "chain")) return respond({ error: "invalid_fields" }, 400);
      const org = await chainOf(chainCode);
      if (!org) return respond({ error: "chain_not_found" }, 404);
      const { data, error } = await admin.rpc("maha_set_invoice_scope", { p_owner: ownerId, p_org: org, p_scope: scope });
      if (error || !data) return chainError(error);
      return respond({ ok: true, invoice_scope: scope });
    }
    if (action === "move_hotel") {
      const code = str("property_code").toUpperCase();
      if (!CODE.test(code) || (chainCode && !CHAIN.test(chainCode))) return respond({ error: "invalid_fields" }, 400);
      const hotel = await hotelOf(code);
      if (!hotel) return respond({ error: "property_not_found" }, 404);
      let target: string | null = null;
      if (chainCode) {
        target = await chainOf(chainCode);
        if (!target) return respond({ error: "chain_not_found" }, 404);
      }
      const { data, error } = await admin.rpc("maha_move_hotel", { p_owner: ownerId, p_property_id: hotel, p_target_org: target });
      if (error || !data) return chainError(error);
      return respond({ ok: true });
    }
    // set_access
    const code = str("property_code").toUpperCase();
    if (!USERNAME.test(username) || !CODE.test(code) || typeof body.allowed !== "boolean") return respond({ error: "invalid_fields" }, 400);
    const hotel = await hotelOf(code);
    if (!hotel) return respond({ error: "property_not_found" }, 404);
    const { data, error } = await admin.rpc("maha_set_hotel_access", {
      p_owner: ownerId, p_username: username, p_property_id: hotel, p_allowed: body.allowed,
      p_role: body.role === "property_admin" ? "property_admin" : "staff",
    });
    if (error || !data) return chainError(error);
    return respond({ ok: true, allowed: body.allowed, hotels: (data as { hotels?: unknown }).hotels });
  }

  // ---------------------------------------------------------------- Tax Invoice Reference (Standard or Manual)
  if (action === "set_invoice_format") {
    const code = str("property_code").toUpperCase();
    const mode = str("mode");
    const prefix = typeof body.prefix === "string" ? body.prefix : "";
    const start = Number(body.start);
    const minDigits = Number(body.min_digits);
    if (!CODE.test(code) || (mode !== "standard" && mode !== "manual")) return respond({ error: "invalid_fields" }, 400);
    if (mode === "manual" && (!/^[A-Za-z0-9_/.-]{0,20}$/.test(prefix) || !Number.isInteger(start) || start < 1 || !Number.isInteger(minDigits) || minDigits < 1 || minDigits > 12 || typeof body.unlimited !== "boolean")) {
      return respond({ error: "invalid_fields" }, 400);
    }
    const { data: hotel } = await admin.from("maha_properties").select("id").eq("property_code", code).maybeSingle();
    if (!hotel) return respond({ error: "property_not_found" }, 404);
    const { data, error } = await admin.rpc("maha_set_invoice_format", {
      p_owner: ownerId, p_property: hotel.id as string, p_mode: mode,
      p_prefix: mode === "manual" ? prefix : null, p_start: mode === "manual" ? start : null,
      p_min_digits: mode === "manual" ? minDigits : null, p_unlimited: mode === "manual" ? body.unlimited === true : null,
    });
    if (error || !data) {
      const m = String(error?.message ?? "");
      if (m.includes("start-too-low")) return respond({ error: "start_too_low" }, 409);
      if (m.includes("invalid-format")) return respond({ error: "invalid_fields" }, 400);
      if (error?.code === "42501") return respond({ error: "forbidden" }, 403);
      return respond({ error: "invoice_format_failed" }, 502);
    }
    return respond({ ok: true, invoice_mode: mode });
  }

  return respond({ error: "unsupported_action" }, 400);
};

Deno.serve(async (req) => withOrigin(req, await handle(req)));
