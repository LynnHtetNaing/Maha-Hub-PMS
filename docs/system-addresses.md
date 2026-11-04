# System addresses (one address per system, nothing redirected)

| Address | Opens |
|---|---|
| solutions.maha-hub.com | Main page: choose a system |
| pms.maha-hub.com | Maha PMS |
| crm.maha-hub.com | Maha Sales, Company: the Maha Hub team's own sales system. Provider accounts only, opened from the Provider console menu, never on the Main page |
| console.maha-hub.com | Provider console sign-in |
| sales.maha-hub.com | Reserved for the future hotel Sales. It will never share an address, folder or table with the company Sales |
| connect. / booking. / reach.maha-hub.com | Later, when released (set CONNECT_HOST, BOOK_HOST, REACH_HOST in both wrangler.toml files) |
| maha-hub.com | The website only |

Signing in once: when someone switches system, the page puts the sign-in in the `#mh=` part of the next address. A browser never sends that part to any server; the next page stores it and clears it from the address bar at once.

Order of work: 1 Supabase functions, 2 Supabase Auth URLs, 3 Cloudflare domains, 4 merge, 5 test.
Rollback: remove the setting values (empty = off) in both wrangler.toml files and merge.
