const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const catalog=fs.readFileSync(process.argv[3],'utf8');
const cron=fs.readFileSync(process.argv[4],'utf8');
const edge=fs.readFileSync(process.argv[5],'utf8');
const migration=fs.readFileSync(process.argv[6],'utf8');
const fail=m=>{console.error('FAIL',m);process.exit(1)};
const checks=[
 [src.includes("const hotels=all.filter(h=>h.active!==false)"),'Systems matrix includes every active property'],
 [src.includes('class="sysmatrix"')&&src.includes('id="sysRows"'),'Systems are displayed as columns across hotel rows'],
 [src.includes('data-booksetup=')&&src.includes('go(\'prov.be.profile\')'),'Booking Engine Admin opens its private setup workspace'],
 [src.includes('data-users=')&&src.includes("go('prov.perms')"),'Manage users opens existing User Details & Permission'],
 [src.includes("id=\"sysNewBE\"")&&src.includes("action:'create_booking_engine'"),'Provider can create a standalone Booking Engine'],
 [src.includes('h.bookingOnly=true')&&src.includes('ProvSync.adopt(code,d.property_id)'),'Standalone Booking Engine uses the existing tenant record sync without a PMS login'],
 [src.includes("SEC.types($('#gTypes',el))")&&src.includes("SEC.rooms($('#gRooms',el))")&&src.includes("SEC.rates($('#gRates',el))"),'Standalone setup includes room types, rooms and rate plans'],
 [src.includes("id=\"p_gtitle\"")&&src.includes("title:$('#p_gtitle',box).value.trim()"),'Booking Engine Title is saved with the hotel booking profile'],
 [catalog.includes('engineTitle: g.title || s.name || h.code'),'Public catalog exposes the configured Booking Engine Title'],
 [src.includes("if(H.bookingOnly){rep.innerHTML='<p class=\"sub\">Loading standalone Booking Engine requests"),'Standalone Booking Engine reports read booking requests without PMS reservations'],
 [src.includes("if(kind==='hub'&&h&&h.bookingOnly)"),'Booking-only properties cannot be opened as Maha PMS'],
 [cron.includes('prop.product_mode === "booking_only"')&&cron.includes('alert_type: "arrival"')&&cron.includes('alert_type: "departure"'),'Standalone Booking Engine supports arrival and departure lifecycle emails'],
 [edge.includes('action === "create_booking_engine"')&&edge.includes('maha_provision_booking_only'),'Provider backend provisions standalone engines without creating a staff account'],
 [migration.includes("product_mode in ('pms', 'booking_only')")&&migration.includes('to service_role')&&migration.includes('from public, anon, authenticated'),'Booking-only property provisioning is restricted to the server role'],
 [!src.includes('Build and test the apps (provider only)'),'Provider-only Build and test section is removed']
];
for(const [ok,name] of checks){if(!ok)fail(name);console.log('PASS',name)}
