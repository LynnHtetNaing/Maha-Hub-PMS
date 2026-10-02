# Middle connectivity provider — selection criteria

Goal: choose a **certified** hub so Maha Connect can reach OTAs without Maha being an OTA Connectivity Partner yet.

## Must have

| Criterion | Why |
|---|---|
| **Official OTA certifications** | Agoda, Booking.com, Expedia at minimum for ASEAN; list must be contractually real, not marketing fluff |
| **Documented two-way API** | Push availability / rates / restrictions; pull or webhook reservations, mods, cancels |
| **Sandbox / cert environment** | Test mapping + ARI + reservations before production hotels |
| **White-label or silent partner allowed** | Hotels see **Maha Connect**, not forced to live in the provider’s extranet as primary UI |
| **Multi-property / multi-tenant** | Padauk operates many hotels under one org |
| **Idempotent reservation delivery** | External reservation ID + event type so Hub does not double-book |
| **Credential isolation** | Per-property secrets; Maha stores only encrypted tokens server-side |
| **Commercial clarity** | Per-room or per-property pricing; no surprise OTA commission clawbacks on the CM fee itself |

## Strongly preferred

| Criterion | Why |
|---|---|
| ASEAN support (TH / VN / KH / MY / MM) | Matches Maha hotel footprint |
| Webhooks with signature verification | Real-time without aggressive polling |
| Mapping APIs (rooms + rates) | Connect UI can drive mapping |
| Rate multipliers / derived-rate support | Matches CM workflows hotels expect |
| PMS-agnostic inbound | Maha Hub is custom; need a clean REST/webhook contract |
| SLA + status page + escalation contacts | Overbooking risk needs human backup |
| Data residency / DPA acceptable to Padauk | Guest PII in reservations |
| Exit clause | Export mappings + open ARI history if Maha later goes direct-cert |

## Disqualify

- Scraping / RPA against OTA extranets (fragile, often against ToS)
- “We email you bookings” with no API
- Requires Maha to abandon Hub as SoT for rooms/inventory
- Credentials must be stored in frontend or shared Google Sheets
- No sandbox
- Contract forbids building Maha-branded CM on top of their API

## Evaluation scorecard (use when shortlisting)

Score 1–5 each; prefer total ≥ 36/50 before POC.

1. OTA coverage (target markets)  
2. API completeness (ARI + reservations + mapping)  
3. Webhook quality / latency  
4. Sandbox usability  
5. White-label / branding rights  
6. Multi-tenant ops fit  
7. Security (secrets, PCI stance on VCC)  
8. Support responsiveness  
9. Price predictability  
10. Contract flexibility / exit  

## POC checklist (before hotel go-live)

1. Connect one test property end-to-end through Maha Connect UI  
2. Push avail + rate for 30 days  
3. Receive test reservation → appears in Maha Hub with external ID  
4. Modification + cancellation round-trip  
5. Fail a credential → Connect shows ERROR, no silent success  
6. Confirm no circular sync (Hub → Connect → provider → Hub loop)  
7. Legal: DPA + subprocessor list reviewed  

## Maha architecture rule

```text
Maha Connect adapter interface
  ├── mock          (always on for QA)
  ├── middle        (chosen certified provider)
  ├── direct.*      (future per-OTA, after Maha cert)
  └── booking       (Maha Booking Engine as Direct)
```

Never call provider/OTA APIs from Hub browser code. All secrets stay in Connect server / secure env.
