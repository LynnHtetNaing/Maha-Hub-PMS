/* Maha Pay: a hotel can pay its own subscription invoice from inside the PMS Backend, via a real Stripe Checkout
   session under Maha Hub's own ("billing") account - never a hotel's own Stripe, never shown as "Stripe" to the
   hotel. Separate, unrelated to a hotel's own Stripe account for collecting its guests' card payments (unchanged).
     node tests/sync/mahapay-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const pms = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const migration = rd('supabase/migrations/20261117_044_stripe_keys.sql');
const keysFn = rd('supabase/functions/stripe-keys/index.ts');
const payFn = rd('supabase/functions/stripe-billing-pay/index.ts');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('maha_stripe_keys never lets the browser read it directly: no grant to authenticated, RLS on, two purposes kept apart (billing has no property_id, ever)',
  migration.includes('revoke all on public.maha_stripe_keys from public, anon, authenticated;') && !migration.includes('grant select on public.maha_stripe_keys') &&
  migration.includes("check (purpose <> 'billing' or property_id is null)") && migration.includes("purpose text not null default 'guest' check (purpose in ('billing', 'guest'))"));
T('one platform row per purpose, at most one row per hotel for the guest purpose', migration.includes('create unique index if not exists maha_stripe_keys_property_uidx on public.maha_stripe_keys(purpose, property_id) where property_id is not null;') && migration.includes('create unique index if not exists maha_stripe_keys_platform_uidx on public.maha_stripe_keys(purpose) where property_id is null;'));

T('stripe-keys never returns the secret except via get_secret to someone already allowed to write that row', keysFn.includes('if (action === "get_secret") out.secret = (r && r.secret_key) || "";') && !keysFn.includes('out.secret = (r && r.secret_key)') === false && keysFn.includes('const needWrite = action === "set" || action === "clear" || action === "get_secret";'));
T('a billing-purpose call can never carry a property_code - it is always the one platform account', keysFn.includes('if (purpose === "billing" && code) return json(req, { error: "bad_request" }, 400);'));
T('setting or clearing the platform (property_code-less) row always needs the platform admin, for either purpose', keysFn.includes('const { data: isAdmin } = await userClient.rpc("maha_is_platform_admin");'));

T('stripe-billing-pay creates a real Stripe Checkout session server-side, using only the platform billing secret - never a hotel\'s own key, never returned to the browser',
  payFn.includes('.eq("purpose", "billing").is("property_id", null)') && payFn.includes('https://api.stripe.com/v1/checkout/sessions') && payFn.includes('Authorization: "Bearer " + secret') && !payFn.includes('out.secret') && !payFn.includes('return json(req, { secret'));
T('the Checkout page itself is Maha Pay branded, not "Stripe", in the product name shown to the hotel', payFn.includes('"Maha Pay – " + (doc.kind'));
T('confirm never trusts the query string alone - it re-fetches the session from Stripe and checks both paid and the right invoice before marking anything paid',
  payFn.includes('const paid = session.payment_status === "paid" || session.status === "complete";') && payFn.includes('if (paid && session.client_reference_id === doc.id && doc.status !== "paid")'));
T('only an open invoice or subscription can be paid, and an already-paid one is refused up front', payFn.includes('if (!["invoice", "subscription"].includes(doc.kind)) return json(req, { error: "bad_request" }, 400);') && payFn.includes('if (doc.status === "paid") return json(req, { error: "already_paid" }, 409);'));

T('the provider sets Maha Pay billing keys once, for the whole platform (purpose "billing", no property_code) - nothing to configure per hotel', pms.includes("body:JSON.stringify({action:'set',purpose:'billing',publishable,secret})") && pms.includes('<h3 style="margin-top:0">Maha Pay — Billing</h3>') && pms.includes('A hotel never sees the word "Stripe" here, only <b>Maha Pay</b>.'));
T('the existing hotel-own-Stripe (guest payment) section on the same page is untouched and clearly separated from Maha Pay billing above it', pms.includes("Everything below is the OTHER Stripe use: a hotel's own account for collecting ITS guests'") && pms.includes('<h3 class="mt" id="stHotelHead">This hotel’s Stripe keys</h3>'));

T('an open invoice in the hotel\'s own Billing > Invoices page gets a "Pay with Maha Pay" button that starts the real Checkout flow', pms.includes("r.status==='open'?`<button type=\"button\" class=\"btn sm gold\" data-mahapay=\"${esc(r.id)}\">Pay with Maha Pay</button>`:''") && pms.includes("$$('[data-mahapay]',el).forEach(b=>b.onclick=()=>mahaPayStart(b.dataset.mahapay,b))"));
T('returning from Checkout re-confirms the payment with the server (never trusts the URL) before showing it as paid, and always cleans the pay params out of the address bar', pms.includes('const paid=await mahaPayConfirm(hq.get(\'doc\'),hq.get(\'session_id\'));') && pms.includes("history.replaceState(null,'',location.pathname+location.search+'#/sbill.invoices')"));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
