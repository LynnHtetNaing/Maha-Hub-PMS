/* Maha Sales (CRM): the OneHotel Sales menu titles and their pages, the sales Dashboard, the profile badge under the title, and the Accounting hook.
   node tests/sync/crm-menu-test.js */
const fs = require('fs'), path = require('path');
const crm = fs.readFileSync(path.join(__dirname, '..', '..', 'crm', 'index.html'), 'utf8');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
const groups = ['Database', 'Follow up', 'Meeting & quotation', 'Activation', 'KPI', 'Enewletter'];
T('the six OneHotel Sales titles are folding groups in the left menu', groups.every(g => crm.includes("{g:'" + g + "'")) && crm.includes('aria-expanded') && crm.includes('maha.crm.nav'));
const items = ['Hotel list', 'Add new hotel', 'Database log', 'Upload database', 'Agent list', 'Add new agent', 'Latest follow up', 'Setup meeting', 'Meeting status', 'Manage quotation', 'Pending', 'Waiting for approval', 'List of activation', 'Setup activation', 'Number of appointment', 'Number of signed contract', 'Number of activation', 'Enewletter'];
T('every function of the OneHotel Sales menu is there', items.every(i => crm.includes("['" + i + "',")));
const views = ['vDashboard', 'vDblog', 'vAgents', 'vFollowup', 'vMeetings', 'vActivations', 'vKpi', 'vEnews'];
T('every page is routed, and the route list accepts it', views.every(v => crm.includes('function ' + v) && crm.includes(':' + v)) && ['dashboard', 'dblog', 'agents', 'followup', 'meetings', 'activations', 'kpi', 'enews'].every(r => crm.includes("'" + r + "'")));
T('every action the menu uses exists', ['newAgent', 'editAgent', 'newMeeting', 'newActivation', 'editActivation', 'meetf', 'actf', 'enewsOpen', 'enewsCopy', 'enewsSave', 'enewsLoad', 'dashn'].every(a => new RegExp('\\b' + a + ':').test(crm)));
T('the Dashboard shows quotations generated, rejected, signed and the revenue of signed hotels as line charts', crm.includes('Quotation generated, rejected and signed') && crm.includes('Revenue of signed hotels') && crm.includes('function lineChart') && crm.includes('<polyline'));
T('commission revenue is not made up: it comes from the Accounting system through one hook, empty until that exists', crm.includes('const ACC_LINK') && crm.includes('commissionRevenue: month => null') && crm.includes('ACC_LINK.commissionRevenue('));
T('the profile badge sits under the title at the left on a desktop, the menu opens beside it', /@media \(min-width:900px\)\{\.onlymob\{display:none\}\s*\.prof\{top:80px;left:22px;right:auto/.test(crm));
T('new record kinds fit the sync table (lowercase letters, 24 at most)', ['agent', 'activation', 'enews'].every(k => /^[a-z][a-z0-9_]{0,23}$/.test(k)) && crm.includes("kind:'agent'") && crm.includes("kind:'activation'") && crm.includes("kind:'enews'"));
T('approval is needed only below the official price (a discount, or a commission rate under the list); the approval is tied to the exact discount; the PDF and Sent are blocked until approved; only the provider approves', crm.includes('function belowList') && crm.includes('function approvalState') && crm.includes('const discSig') && crm.includes("approvalState(q) === 'waiting'") && crm.includes('it needs approval before the quotation is downloaded') && crm.includes('it needs approval before it is Sent') && crm.includes('async function canApprove') && crm.includes('sess.member === false') && crm.includes('Special discount'));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
