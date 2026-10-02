# Maha Connect — Phase 1 foundation

Status: **foundation only**. Not live on any OTA. No OTA credentials in this repo. Real distribution requires either (a) Maha’s own OTA certification later, or (b) a **middle connectivity provider** that is already certified.

Checked: 2 October 2026.

## Product role

```text
Maha Hub PMS  ↔  Maha Connect  ↔  Middle provider (certified)  ↔  OTAs
                              ↕
                     Maha Booking (Direct)
                              ↕
                     Mock adapter (dev/test)
```

- **Maha Hub** remains the hotel operating system (rooms, folios, front office).
- **Maha Connect** is the distribution / sync layer (mapping, ARI, reservations queue).
- **Middle provider** carries OTA certification until Maha certifies directly (optional later).

## What Phase 1 includes

1. `connect/` local Node service (port **8782**) with foundation APIs.
2. Local JSON store + Supabase SQL draft for multi-tenant Connect tables.
3. Channel registry (Mock + Middle-provider placeholder) — **no live OTA calls**.
4. Property / room type / rate plan / daily inventory foundation.
5. Hub provider toggle `systems.connect` + Systems picker entry.
6. Honest UI: never claims “live on OTAs” or “certified.”

## What Phase 1 does **not** include

- Live Agoda / Booking.com / Expedia adapters
- Real middle-provider production credentials
- Full Rate & Availability calendar UX (Phase 2)
- Sync job worker with retries (Phase 3)
- Yield / promotions (Phase 5)
- Production RLS on Supabase (schema drafted; enable with care)

## Middle-provider path (approved strategy)

Prefer integrating **one certified connectivity hub** first so hotels can get real OTA sync without waiting for Maha’s own OTA certifications. See `PROVIDER-CRITERIA.md`.

## Build order after Phase 1

2. Rate & Availability calendar + derived rates  
3. Mapping + Mock sync engine + queue  
4. Reservations normalizer → Hub  
5. Yield / promotions  
6. Dashboard / reports  
7. Hub + Booking Engine hard integration  
8. Real middle-provider adapter (then optional direct OTAs)  
9. Hardening  

## Local run

```bash
node connect/server.mjs
# http://127.0.0.1:8782/
```

Hub publishes a property snapshot to Connect when the provider opens Connect and staff use **Publish from Hub** (Phase 1 bridge).
