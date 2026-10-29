# Maha PMS screen addresses

Every screen has its own address, written after `#/`. For example the folio screen is
`https://maha-hub.com/solutions-PMS#/bill.folio`.

- **Back / Forward** move between screens, a **reload** or a **duplicated tab** opens the same screen.
- You can bookmark a screen or send the link. The person must still be signed in, and the screen opens only if the menu would show it to that person (permission and hotel functions).
- An address that is not allowed (for example a provider screen for staff) simply opens the first screen.

## Screens with a record

| Screen | Address |
|---|---|
| One reservation | `#/res.open?a=<booking id>` |
| Folio of one booking | `#/bill.open?a=<booking id>` |

## Hotel menu (Frontend)

| Group | Screen | Address | Needs permission |
|---|---|---|---|
| Profile | Guest Profile | `#/profile.guests` | profile |
| Profile | Company / Agency | `#/profile.companies` | — |
| Profile | Rate Codes | `#/profile.rates` | — |
| Reservation | New Reservation | `#/res.new` | res.create |
| Reservation | Walk-In | `#/res.walkin` | res.create |
| Reservation | Reservation List / Change | `#/res.list` | — |
| Reservation | Group Reservation | `#/res.group` | res.create |
| Reservation | Advance Rate Setup | `#/res.rate` | rate |
| Reservation | Room Grid | `#/fo.grid` | — |
| Front Office | Manager Dashboard | `#/fo.dash` | reports |
| Front Office | Arrivals | `#/fo.arrivals` | — |
| Front Office | Departures | `#/fo.departures` | — |
| Front Office | In House | `#/fo.inhouse` | — |
| Front Office | Duty Roster | `#/fo.roster` | — |
| Billing / Folio | Folio | `#/bill.folio` | — |
| Billing / Folio | Folio Inquiry | `#/bill.inquiry` | — |
| Billing / Folio | Transaction Inquiry | `#/bill.trans` | — |
| Billing / Folio | Payment / EDC links | `#/bill.edclinks` | pay |
| Billing / Folio | City Ledger | `#/bill.city` | pay |
| Billing / Folio | Master Folio | `#/bill.master` | — |
| Billing / Folio | Approvals | `#/set.approve` | approve |
| Room Management | Housekeeping Status | `#/rm.hkstatus` | — |
| Room Management | HK Folio | `#/rm.hkfolio` | — |
| Room Management | Out of Order | `#/rm.ooo` | — |
| Inquiry | Hotel Status | `#/fo.status` | — |
| Inquiry | Guest | `#/inq.guest` | — |
| Inquiry | Booking History | `#/inq.history` | — |
| Inquiry | Forecast | `#/inq.forecast` | — |
| Close Day | Post Room / Close Day | `#/cd.close` | — |
| Close Day | My Shift & Cashier | `#/cd.shift` | — |
| Close Day | Petty Cash | `#/cd.petty` | — |
| Help | Help | `#/help.home` | — |
| Setup | Hotel Settings | `#/set.hotel` | setup |
| Setup | Functions | `#/set.features` | setup |
| Setup | Staff & Permissions | `#/set.users` | — |
| Setup | User Logs | `#/set.userlogs` | userlogs |
| Setup | Transaction Codes | `#/set.codes` | — |
| Setup | Rooms & Room Types | `#/set.rooms` | — |
| Setup | Purchasing & AP | `#/ac.buy` | setup |

## Backend menu

| Group | Screen | Address | Needs permission |
|---|---|---|---|
| Property set-up | Hotel Settings | `#/set.hotel` | setup |
| Property set-up | Rooms & Room Types | `#/set.rooms` | — |
| Property set-up | Transaction Codes | `#/set.codes` | — |
| Rates & profiles | Rate Codes | `#/profile.rates` | — |
| Rates & profiles | Advance Rate Setup | `#/res.rate` | rate |
| Rates & profiles | Company / Agency | `#/profile.companies` | — |
| People & access | Staff & Permissions | `#/set.users` | — |
| People & access | User Logs | `#/set.userlogs` | userlogs |
| Finance & data | Purchasing & AP | `#/ac.buy` | setup |
| Help | Help | `#/help.home` | — |

## Provider console

| Group | Screen | Address | Needs permission |
|---|---|---|---|
| Properties | All properties | `#/prov.home` | — |
| Properties | Property setup | `#/prov.setup` | — |
| Setup | Staff & permissions | `#/prov.perms` | — |
| Setup | Functions & plan | `#/prov.functions` | — |
| Setup | Systems | `#/prov.systems` | — |
| Setup | Direct booking & Google | `#/prov.google` | — |
| Setup | EDC Card Link | `#/prov.edc` | — |
| Setup | Stripe payments (3DS) | `#/prov.stripe` | — |
| Setup | System rules | `#/prov.rules` | — |
| Setup | Distribution (Google Hotels) | `#/prov.distribution` | — |
| Setup | Code catalog (all hotels) | `#/prov.catalog` | — |
| Setup | Security Center | `#/prov.security` | — |
| Setup | Backup & migration | `#/prov.backup` | — |
| Setup | Chains / Groups | `#/prov.chains` | — |
| Setup | Recycle bin | `#/prov.recycle` | — |
| Records | Announcements | `#/prov.announce` | — |
| Records | Approvals inbox | `#/prov.approvals` | — |
| Records | Amend records | `#/prov.amend` | — |
| Records | Amendment log | `#/prov.log` | — |
| Records | User Logs | `#/prov.userlogs` | — |
| Account | My profile | `#/prov.account` | — |

