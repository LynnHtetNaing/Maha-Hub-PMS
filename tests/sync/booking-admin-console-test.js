const fs=require('fs');
const [appPath,edgePath,migrationPath,catalogPath,serverPath,guestPath,cronPath]=process.argv.slice(2);
const read=p=>fs.readFileSync(p,'utf8');
const app=read(appPath),edge=read(edgePath),migration=read(migrationPath),catalog=read(catalogPath),server=read(serverPath),guest=read(guestPath),cron=read(cronPath);
const systems=app.slice(app.indexOf("VIEWS['prov.systems']"),app.indexOf("VIEWS['prov.rules']"));
const checks=[
  [systems.includes("filter(h=>h&&h.set&&h.active!==false)"),'Systems matrix lists every active property'],
  [systems.includes("sysmatrix")&&systems.includes("smx-toggle"),'Systems matrix uses per-system on/off controls'],
  [systems.includes("data-manage-users")&&systems.includes("go('prov.perms')"),'Every property links to user management'],
  [systems.includes("Maha HR")&&systems.includes("Maha Account")&&systems.includes("Maha Manage")&&systems.includes("Maha POS")&&systems.includes("Maha Stock"),'Systems matrix includes unreleased product columns'],
  [!app.includes("Build and test the apps (provider only)"),'Removed the Build and Test section'],
  [app.includes("VIEWS['prov.be.console']")&&app.includes("Booking Engine Administration"),'Provider console has a central Booking Engine administration page'],
  [app.includes("Booking Engine Title")&&app.includes("id=\"beTitle\""),'Booking Engine title is editable in its profile'],
  [app.includes("VIEWS['prov.be.inventory']")&&app.includes("virtual:true"),'Standalone Booking Engine can create room types and inventory'],
  [app.includes("VIEWS['prov.be.rates']")&&app.includes("Rate Plans"),'Standalone Booking Engine can configure rate plans'],
  [app.includes("standaloneBookingRequests")&&app.includes("standaloneBookingReports"),'Standalone bookings and reports do not depend on PMS reservations'],
  [app.includes("createBookingProperty")&&app.includes("action:'create_booking_property'"),'Admin console provisions a Booking-only property'],
  [app.includes("system:hh.set.pmsEnabled===false?'book':'pms'"),'New staff for Booking-only properties receive Booking sign-in links'],
  [app.includes("u.systems.hub=false"),'Booking-only staff cannot be granted PMS access by defaults'],
  [app.includes("const BOOKING_ONLY_MENU=")&&app.includes("function firstHotelView(){if(H&&H.set&&H.set.pmsEnabled===false)"),'Booking-only users land in a dedicated Booking Engine workspace'],
  [edge.includes('if (action === "create_booking_property")')&&edge.includes('maha_provision_booking_property'), 'Provider edge function creates Booking-only tenant identities'],
  [edge.includes('book: "https://solutions.maha-hub.com/reset-password.html?system=book"'), 'Booking-only password reset link returns to private Booking sign-in'],
  [migration.includes('add column if not exists pms_enabled boolean not null default true'), 'Existing properties remain PMS-enabled by default'],
  [migration.includes('values (v_org, trim(p_property_name), upper(trim(p_property_code)), false)'), 'Standalone properties are provisioned with PMS disabled'],
  [migration.includes('standalone_ref')&&migration.includes('MBE-'), 'Standalone bookings receive independent references'],
  [migration.includes('not v_pms_enabled or br.confirmed_reservation_no is null'), 'Standalone bookings remain in their own availability ledger'],
  [catalog.includes('bookingTitle: g.title || s.name || h.code'), 'Public catalog exposes the configured Booking Engine title'],
  [server.includes('name: h.bookingTitle || h.name'), 'Public hotel list uses Booking Engine title'],
  [guest.includes("h.bookingTitle || h.name")&&guest.includes("document.title = (h.bookingTitle || h.name)"), 'Guest booking page displays Booking Engine title'],
  [cron.includes('if (prop.pms_enabled === false)')&&cron.includes('r.standalone_ref'), 'Standalone properties receive Booking Engine lifecycle emails']
];
for(const [ok,name] of checks){if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
if(!checks.every(x=>x[0]))process.exit(1);
