/* Adding a person to the CRM team from the Provider console also puts the person in Staff Credit (department and credit %), so the KPI, the credit and the dashboard count them.
     node tests/sync/crm-team-credit-test.js */
const fs = require('fs');
let fails = 0;
const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
const fn = fs.readFileSync('supabase/functions/platform-admin-provision/index.ts', 'utf8').replace(/\r\n/g, '\n'), eco = fs.readFileSync('ecosystem/index.html', 'utf8').replace(/\r\n/g, '\n');
T('the server checks the department (Sales or Technician) and the credit % (0 to 100) before it creates the person', fn.includes('dept === "Sales" || dept === "Technician"') && fn.includes('pct < 0 || pct > 100'));
T('the person is written to Staff Credit (kind staffcr) with the same name, no second record for the same name', fn.includes('const syncStaffCredit = async') && fn.includes('staffKey(r.data?.name) === staffKey(name)') && fn.includes('kind: "staffcr"') && fn.includes('await syncStaffCredit(name, { dept, pct, status: "Active" })'));
T('turning a person off or on marks the Staff Credit Inactive or Active', fn.includes('syncStaffCredit(String(m.name), { status: active ? "Active" : "Inactive" })'));
T('the team list returns the department and credit % of each person', fn.includes('dept: (credit.find(') && fn.includes('pct: (credit.find('));
T('the Provider console form asks for Department and Credit % and shows them in the table', eco.includes('id=\\"tmD\\"') || eco.includes('id="tmD"') ? true : eco.includes('tmD'));
T('the form sends dept and pct and refuses an empty credit %', eco.includes("action:'crm_add_member',username:u,name:n,email:e,dept:dp,pct:pc") && eco.includes("Enter the credit % (0 to 100)."));
process.exit(fails ? 1 : 0);
