// Supabase Edge Function: username-auth
// Configure secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Optional: MAHA_REQUIRE_CODE=on turns on the emailed sign-in code (see below). It stays off until the new
// sign-in page is live, so a page that does not know about the code is never locked out.
// Deploy with JWT verification disabled for this function only; this handler validates
// the requested operation and only returns a Supabase Auth session after password auth.
// Never log request bodies, passwords, auth tokens, codes, or recovery email addresses.
//
// Emailed sign-in code (when MAHA_REQUIRE_CODE=on):
//   1. sign_in: password is right, but this browser is not a trusted device (or its last code was over 30 days ago)
//      -> no session is returned. Supabase Auth emails a 6-digit code to the account address and we answer
//      { needs_code: true, challenge }.
//   2. verify_code: username + challenge + code (+ remember) -> the session, and with remember=true this device is
//      trusted for the next 30 days. The challenge lasts 10 minutes and allows 5 tries.
// The browser keeps a random device id; only its SHA-256 hash is stored.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("MAHA_ALLOWED_ORIGIN") || "https://maha-hub.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const TRUST_DAYS = 30;
const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
// a@b.com -> a***@b.com, so the page can say where the code went without showing the whole address
const maskEmail = (email: string): string => {
  const at = email.indexOf("@");
  return at < 1 ? "your email" : email.slice(0, 1) + "***" + email.slice(at);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "auth_not_configured" }, 503);
  const requireCode = (Deno.env.get("MAHA_REQUIRE_CODE") || "").toLowerCase() === "on";

  let body: {
    action?: unknown; username?: unknown; password?: unknown;
    device_id?: unknown; challenge?: unknown; code?: unknown; remember?: unknown;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

  const action = body.action === "request_password_reset" ? "request_password_reset"
    : body.action === "verify_code" ? "verify_code" : "sign_in";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username) || (action === "sign_in" && (password.length < 1 || password.length > 1024))) {
    return json({ error: "invalid_credentials" }, 401);
  }

  // Service role is used only server-side to resolve the private username mapping.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Activity log (server-side, permanent). Best effort: it can never break a sign-in.
  const logEvent = (event: string, userId: string | null, ok: boolean, detail: string | null) => {
    try {
      const p = Promise.resolve(admin.rpc("maha_log_event", {
        p_actor_user: userId, p_actor_username: username, p_event: event, p_target: null,
        p_property_code: null, p_ok: ok, p_detail: detail,
      })).catch(() => undefined);
      (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(p);
    } catch { /* ignore */ }
  };
  const { data: identity, error: lookupError } = await admin
    .from("maha_login_identities")
    .select("user_id,recovery_email")
    .eq("username_normalized", username.toLowerCase())
    .maybeSingle();

  // Keep password-reset responses identical for existing and unknown usernames.
  if (action === "request_password_reset") {
    if (!lookupError && identity?.recovery_email) {
      const recoveryClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await recoveryClient.auth.resetPasswordForEmail(identity.recovery_email, {
        redirectTo: "https://maha-hub.com/reset-password.html",
      });
      logEvent("password_reset_requested", identity.user_id, true, null);
    }
    return json({ ok: true, message: "If the account exists, recovery instructions will be sent to its linked email." });
  }

  // Same response for unknown username and wrong password prevents username enumeration.
  if (lookupError || !identity?.recovery_email) return json({ error: "invalid_credentials" }, 401);

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sessionBody = (data: {
    session: { access_token: string; refresh_token: string; expires_in: number; token_type: string };
    user: { id: string; email?: string } | null;
  }) => json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: { id: data.user?.id, email: data.user?.email },
  });
  const deviceId = typeof body.device_id === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.device_id) ? body.device_id : "";

  // ---- step 2: the 6-digit code from the email ----
  if (action === "verify_code") {
    const challenge = typeof body.challenge === "string" ? body.challenge : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!requireCode || !deviceId || !/^[0-9a-f-]{36}$/i.test(challenge) || !/^\d{6}$/.test(code)) {
      return json({ error: "code_wrong" }, 401);
    }
    const deviceHash = await sha256Hex(deviceId);
    const { data: tryResult, error: tryError } = await admin.rpc("maha_login_challenge_try", {
      p_id: challenge, p_user: identity.user_id, p_device_hash: deviceHash,
    });
    if (tryError) return json({ error: "code_unavailable" }, 503);
    if (tryResult === "expired") return json({ error: "code_expired" }, 401);
    if (tryResult === "locked") {
      logEvent("sign_in_code_locked", identity.user_id, false, "too many wrong codes");
      return json({ error: "code_locked" }, 401);
    }
    if (tryResult !== "ok") return json({ error: "code_expired" }, 401);

    const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({
      email: identity.recovery_email, token: code, type: "email",
    });
    if (verifyError || !verified.session || verified.user?.id !== identity.user_id) {
      logEvent("sign_in_code_failed", identity.user_id, false, "wrong code");
      return json({ error: "code_wrong" }, 401);
    }
    await admin.rpc("maha_login_challenge_done", { p_id: challenge, p_remember: body.remember === true });
    logEvent("sign_in", identity.user_id, true, body.remember === true ? "code, device registered" : "code");
    return sessionBody({ session: verified.session, user: verified.user });
  }

  // ---- step 1: the password ----
  const { data, error } = await authClient.auth.signInWithPassword({
    email: identity.recovery_email,
    password,
  });

  if (error || !data.session || data.user?.id !== identity.user_id) {
    // only for a username that exists (unknown names are not logged), and the log throttles repeats
    logEvent("sign_in_failed", identity.user_id, false,
      (error as { code?: string } | null)?.code === "user_banned" ? "account disabled" : "wrong password");
    return json({ error: "invalid_credentials" }, 401);
  }

  if (requireCode) {
    // A browser that does not send a device id cannot be trusted and cannot take part in the code step.
    if (!deviceId) return json({ error: "device_required" }, 409);
    const deviceHash = await sha256Hex(deviceId);
    const { data: trusted, error: trustError } = await admin.rpc("maha_device_trusted", {
      p_user: identity.user_id, p_device_hash: deviceHash, p_days: TRUST_DAYS,
    });
    if (trustError) return json({ error: "code_unavailable" }, 503);      // fail closed: never skip the check on an error
    if (trusted !== true) {
      // The password session is not handed out; it is closed again and the code is emailed.
      // scope "local": only this password session, never the person's other devices
      try { await admin.auth.admin.signOut(data.session.access_token, "local"); } catch { /* ignore */ }
      const { data: challenge, error: challengeError } = await admin.rpc("maha_login_challenge_new", {
        p_user: identity.user_id, p_device_hash: deviceHash,
      });
      if (challengeError || typeof challenge !== "string") return json({ error: "code_unavailable" }, 503);
      const mailClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: mailError } = await mailClient.auth.signInWithOtp({
        email: identity.recovery_email, options: { shouldCreateUser: false },
      });
      if (mailError) {
        const limited = (mailError as { status?: number }).status === 429;
        logEvent("sign_in_code_not_sent", identity.user_id, false, limited ? "too many emails" : "email could not be sent");
        return json({ error: limited ? "code_rate_limited" : "code_not_sent" }, limited ? 429 : 503);
      }
      logEvent("sign_in_code_sent", identity.user_id, true, null);
      return json({ needs_code: true, challenge, sent_to: maskEmail(identity.recovery_email) });
    }
  }
  logEvent("sign_in", identity.user_id, true, null);
  return sessionBody({ session: data.session, user: data.user });
});
