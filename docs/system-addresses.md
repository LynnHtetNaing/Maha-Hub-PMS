# System addresses (one address per system, nothing redirected)

| Address | Opens |
|---|---|
| solutions.maha-hub.com | Main page: choose a system |
| pms.maha-hub.com | Maha PMS |
| crm.maha-hub.com | Maha Sales: the company's own sales software. Its own sales team and sign-in (username, password, emailed code on a new device), installable on a phone, works offline, data in the cloud. Not a hotel system and not on the Main page |
| console.maha-hub.com | Provider console sign-in |
| sales.maha-hub.com | Reserved for the future hotel Sales. It will never share an address, folder or table with the company Sales |
| connect. / booking. / reach.maha-hub.com | Later, when released (set CONNECT_HOST, BOOK_HOST, REACH_HOST in both wrangler.toml files) |
| maha-hub.com | The website only |

Signing in once: when someone switches system, the page puts the sign-in in the `#mh=` part of the next address. A browser never sends that part to any server; the next page stores it and clears it from the address bar at once.

Order of work: 1 Supabase functions, 2 Supabase Auth URLs, 3 Cloudflare domains, 4 merge, 5 test.
Rollback: remove the setting values (empty = off) in both wrangler.toml files and merge.


Maha Sales (crm) is separate software: own address, own folder (/crm), own people (maha_crm_members, added by the Master admin under Sales team in the Provider console), own table (maha_sales_records). The sign-in service refuses anyone who is not on the team right after the password, with no code. Nothing is handed over from another address.
