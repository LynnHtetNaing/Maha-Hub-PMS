// Supabase Edge Function: username-auth
// Configure secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Deploy with JWT verification disabled for this function only; this handler validates
// the requested operation and only returns a Supabase Auth session after password auth.
// Never log request bodies, passwords, auth tokens, or recovery email addresses.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "auth_not_configured" }, 503);

  let body: { action?: unknown; username?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_request" }, 400); }

  const action = body.action === "request_password_reset" ? "request_password_reset" : "sign_in";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username) || (action === "sign_in" && (password.length < 1 || password.length > 1024))) {
    return json({ error: "invalid_credentials" }, 401);
  }

  // Service role is used only server-side to resolve the private username mapping.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
        redirectTo: "https://maha-hub.com/reset-password",
      });
    }
    return json({ ok: true, message: "If the account exists, recovery instructions will be sent to its linked email." });
  }

  // Same response for unknown username and wrong password prevents username enumeration.
  if (lookupError || !identity?.recovery_email) return json({ error: "invalid_credentials" }, 401);

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: identity.recovery_email,
    password,
  });

  if (error || !data.session || data.user?.id !== identity.user_id) {
    return json({ error: "invalid_credentials" }, 401);
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: { id: data.user.id, email: data.user.email },
  });
});
