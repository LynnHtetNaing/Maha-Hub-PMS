const fs = require('fs');
const app = fs.readFileSync(process.argv[2] || 'ecosystem/index.html', 'utf8');
const catalog = fs.readFileSync('book/catalog.js', 'utf8');
const cron = fs.readFileSync('supabase/functions/maha-be-cron/index.ts', 'utf8');
let failed = 0;
function check(ok, name) {
  if (ok) console.log('PASS', name);
  else { console.error('FAIL', name); failed++; }
}
check(app.includes("['Booking Engines','prov.bookingengines']"), 'Provider Console has a Booking Engines admin entry');
check(app.includes("VIEWS['prov.bookingengines']=el=>"), 'Booking Engines admin page lists PMS-linked and standalone engines');
check(app.includes('Create standalone Booking Engine'), 'Provider can create a standalone Booking Engine');
check(app.includes('function newPropertyForm(bookingOnly)'), 'Standalone creation reuses the secure hotel provisioning flow');
check(app.includes('h.set.bookingOnly=true') && app.includes('h.set.systems={hub:false'), 'Standalone properties are marked Booking-only and keep PMS closed');
check(app.includes("['Booking Engine Profile','prov.be.profile']"), 'Standalone Booking Engine has its own profile section');
check(app.includes('profile(box){') && app.includes('inventory(box){'), 'Standalone Booking Engine has independent profile and room/rate setup');
check(app.includes('data-rt="allot"') && app.includes('data-rc="scope"'), 'Standalone setup captures room inventory and B2C/B2B rate scope');
check(app.includes("H.set.bookingOnly?[]:rows.filter"), 'Standalone bookings do not materialise into PMS reservations');
check(app.includes("maha_booking_requests?select=id,created_at,status,room_type,rate_code"), 'Standalone production reports use booking requests');
check(app.includes("if(H&&H.set&&H.set.bookingOnly)return [HOTEL_BE_GROUP"), 'Booking-only hotel users see Booking Engine, not PMS setup');
check(app.includes("if(kind==='hub'&&h&&h.set&&h.set.bookingOnly)"), 'PMS entry is blocked for Booking-only properties');
check(app.includes("Manage users & permissions") && app.includes("go('prov.perms')"), 'Systems page links to per-hotel user and permission management');
check(app.includes("filter(h=>h&&h.active!==false)"), 'Systems page lists all active hotels, not only the selected workspace hotel');
check(!app.includes('Build and test the apps (provider only)'), 'Provider-only Build and test section is removed');
check(catalog.includes('if (hotel.bookingOnly)') && catalog.includes('allot: Number(t.allot || 0)'), 'Public catalog uses standalone room-type inventory');
check(catalog.includes('bookingOnly: !!s.bookingOnly'), 'Public catalog identifies standalone properties');
check(cron.includes('standalone && ea.arrival') && cron.includes('standalone && ea.departure'), 'Standalone Booking Engine supports arrival and departure lifecycle emails');
if (failed) process.exit(1);
