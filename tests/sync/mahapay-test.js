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

T('the provider sets Maha Pay billing keys once, on its own whole-system page (no hotel to pick, purpose "billing", no property_code) - nothing to configure per hotel',
  pms.includes("body:JSON.stringify({action:'set',purpose:'billing',publishable,secret})") && pms.includes("VIEWS['prov.mahapay']=async el=>{") && pms.includes("pageHead('Maha Pay — Billing')") && pms.includes('A hotel never sees the word "Stripe" for this, only <b>Maha Pay</b>.'));
T('Maha Pay billing sits under Whole system in the provider menu, not nested under picking a hotel first', pms.includes("['Maha Pay — Billing','prov.mahapay']") && !pms.includes("const PROV_WS_VIEWS=['prov.setup','prov.perms','prov.functions','prov.systems','prov.google','prov.distribution','prov.stripe','prov.billing','prov.approvals','prov.amend','prov.log','prov.userlogs','prov.terms','prov.mahapay']"));
T('the Backend prov.stripe page is admin-only key setup (publishable/secret, Save/Clear) - no Payment Link or card-charge forms there any more, since that moved into the hotel\'s own Advance Payment / Payment window',
  pms.includes("VIEWS['prov.stripe']=async el=>{") && !pms.includes('id="plGo"') && !pms.includes('id="ccGo"') && !pms.includes('id="ccCardMount"') && pms.includes('No Stripe keys shown there, just Maha Pay.'));

T('Maha Pay is a payment option right inside the existing Advance Payment / Payment window (payModal) - a hotel-staff tile, not an admin-only page; the backend page only links the keys, front office then uses it without seeing them',
  pms.includes('let mahaPayOn=false;') && pms.includes('data-pc="__mahapay"') && pms.includes("if(code==='__mahapay'){save();mahaPayOn=true;"));

T('the Maha Pay panel charges via Stripe Elements (never raw card data to our server) or sends a Payment Link, re-using the same guest-pay helpers; it tells the front office plainly when this hotel is not yet linked',
  pms.includes('const initMahaPayPanel=async()=>{') && pms.includes('await hotelStripeStatus(H.code)') &&
  pms.includes("Maha Pay is not set up for this hotel yet. Ask the provider to link this hotel's Stripe keys first.") &&
  pms.includes('await guestPayCharge(H.code,st.publishable,amount,currency,refv,guestv,cardEl)') &&
  pms.includes('await guestPayLink(H.code,amount,currency,refv,guestv)'));


T('an open invoice in the hotel\'s own Billing > Invoices page gets a "Pay with Maha Pay" button that starts the real Checkout flow', pms.includes("r.status==='open'?`<button type=\"button\" class=\"btn sm gold\" data-mahapay=\"${esc(r.id)}\">Pay with Maha Pay</button>`:''") && pms.includes("$$('[data-mahapay]',el).forEach(b=>b.onclick=()=>mahaPayStart(b.dataset.mahapay,b))"));
T('returning from Checkout re-confirms the payment with the server (never trusts the URL) before showing it as paid, and always cleans the pay params out of the address bar', pms.includes('const paid=await mahaPayConfirm(hq.get(\'doc\'),hq.get(\'session_id\'));') && pms.includes("history.replaceState(null,'',location.pathname+location.search+'#/sbill.invoices')"));

T('Recurring charge is just an on/off switch next to the subscription date, not a separate function or an automatic charge', pms.includes('id="pbRecChg"') && pms.includes("h.set.recurringCharge=$('#pbRecChg',box).checked;") && pms.includes('Never charges a card by itself.'));
T('when on, it auto-creates the next open invoice starting HOTEL_WARN_DAYS before the subscription date - never sooner, never after it already ran once for that date - with the same amount/currency as the latest Subscription record, or the latest Invoice if there is no Subscription record (many hotels are only ever billed as a plain invoice); it never creates a zero-amount invoice',
  pms.includes('async function recurringAutoInvoice(h){') &&
  pms.includes("if(!h||!h.set||!h.set.recurringCharge||!h.set.subUntil||!MahaAuth.on())return;") &&
  pms.includes("if(h.set.recurringInvoicedFor===h.set.subUntil)return;") &&
  pms.includes("if(!(days>=0&&days<=HOTEL_WARN_DAYS))return;") &&
  pms.includes("kind=eq.subscription&order=period_to.desc,doc_date.desc&limit=1") &&
  pms.includes("kind=eq.invoice&order=doc_date.desc,created_at.desc&limit=1") &&
  pms.includes("if(!basis||!(+basis.amount>0)){provLog('Recurring charge: no subscription or invoice amount on record for '+h.code+' - nothing auto-created yet. Add one first.');return}") &&
  pms.includes("kind:'invoice',no,doc_date:iso(new Date()),due_date:h.set.subUntil") &&
  pms.includes("h.set.recurringInvoicedFor=h.set.subUntil;"));
T('the auto-created invoice is what the hotel pays itself with Pay with Maha Pay, checked whenever admin opens that hotel\'s Billing page or the whole Hotels list - never a hidden automatic charge',
  pms.includes("provBillRecords($('#pbRec',el),h);recurringAutoInvoice(h)};") &&
  pms.includes('Object.values(DB.hotels).forEach(h2=>recurringAutoInvoice(h2));'));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
