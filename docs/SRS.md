# SpareParts Pro — Software Requirements Specification

**Version:** 1.5 (update to SRS v1.2)  
**Date:** 23 November 2026  
**Owner:** MMM  
**Status:** Demo test for Dr Dami

> **Why "SpareParts Pro".** I built this app for my Dad and his business partners, who run a spare-parts business, to help them keep track of their stock. The name comes straight from that first use: it was made for a spare-parts shop.

> **How to read this version.** SRS v1.2 (part of the SpareParts Pro document pack, with the Brainstorming Register and Business Proposal v2) remains the base document. This file records:
> 1. the build status of every v1.2 requirement as of 23 Nov 2026 (section 2),
> 2. corrections to v1.2 (section 3),
> 3. the new **Release 7: Genuine Parts Trail** (sections 4–12),
> 4. the **installed apps** (Windows, Android) and display rules (sections 14–15), and the **digital receipts** feasibility study (section 16), added in v1.4,
> 5. **customer profiles** and one-tap WhatsApp / email receipts and purchase history (section 17), added in v1.5.
>
> Requirement IDs from v1.2 (FR-01 to FR-29, E-FR-03, UC-01 to UC-04, Releases 1–6) keep their numbers. New items start at FR-30 and UC-05 so nothing clashes. When v1.2's full text is merged into this file, sections 2 and 3 replace v1.2's status notes.

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.2 | Nov 2026 | Base document (document pack): Releases 1–6. |
| 1.3 | 23 Nov 2026 | Releases 1–3 went live; Windows/Android apps added. Build status of Releases 1–3 recorded. Corrections to "missing features" list. Release 7 (Genuine Parts Trail) added, with its requirements, use cases, data model, risks and acceptance tests. Release order updated. |
| 1.4 | 23 Nov 2026 | Offline restocking and stock counting built (Release 3 now built except offline receiving sessions). Installed Windows and Android apps (FR-61 to FR-66). Display rules: upright font, short big amounts (FR-67, FR-68). Digital receipts by email, WhatsApp and SMS: feasibility and proposed requirements (FR-69 to FR-75). |
| 1.5 | 23 Nov 2026 | Decision: digital receipts Phase A, option 1 (one-tap WhatsApp from the shop's own account, free). Customer profiles built (FR-76 to FR-83); FR-69, FR-70 and FR-75 built, FR-73 built for customer details on offline sales. |

---

## 1. Release plan (updated)

| Release | Content | Status (23 Nov 2026) |
|---|---|---|
| 1 | Accountability: staff on each sale, receipt numbers, sign-in records, cancel/return with reason, no double-saved sales | **Built and live** (23 Nov 2026). |
| 2 | Stock control: stock count sessions, owner review of differences | **Built and live** (23 Nov 2026). |
| 3 | Working offline | **Built** (except receiving sessions, which belong to Release 4). Offline sales, restocking and counting; apps open offline. **Live** (23 Nov 2026). |
| 3b | Installed apps: Windows (.exe) and Android (.apk) | **Built.** Pushed to GitHub 23 Nov 2026; installer and Android app come from GitHub → Actions → Build apps. |
| 4 | Stock receiving sessions with review screen | Not started |
| 5 | Guided tutorials with voice, practice mode, French/Igbo | Not started |
| 6 | Configurable product fields and units for other trades (bearings, plastics, electrical) | Not started |
| 6b | Digital receipts (section 16): Phase A free — customer profiles, one-tap WhatsApp, email through the mail app | **Built** (v1.5, section 17). Receipt link page (FR-71) still proposed. |
| 6c | Digital receipts Phase B: fully automatic WhatsApp / SMS | **Proposed.** Paid per message; decide after testers. |
| — | Tester period (2 shops, about 2 weeks) | Next |
| — | Multi-shop version with Paystack paywall | Decide after testing |
| **7** | **Genuine Parts Trail** (this document, sections 4–12) | **Planned.** Starts after Releases 1–3 are live and testing is done. Phase 7B needs the multi-shop version. |

---

## 2. Build status of v1.2 requirements

| ID | Requirement (short) | Status | Where it is |
|---|---|---|---|
| FR-01, FR-02 | Each sale carries staff member, receipt number and time | Built (Oct 2026) | Sales, receipts |
| E-FR-03 | Sign-ins, sign-outs, wrong passwords and lockouts recorded | Built (23 Nov) | Activity Log |
| FR-03 | Cancel or return a sale with a reason; stock restored; sale kept on record | Built (23 Nov) | Receipt → Cancel / return |
| FR-04, FR-05, UC-02 | Stock count sessions; owner reviews and approves differences | Built (23 Nov) | Stock Count screen |
| FR-06, FR-07 | Weekly and monthly reports, including parts not selling | Built (23 Nov) | Reports → Day / Week / Month |
| FR-11 to FR-13, UC-04 | Sales recorded offline and sent later | Built (23 Nov) | Sell screen, yellow "waiting" bar |
| FR-14 | A sale is never saved twice | Built (23 Nov) | Sale reference from the phone |
| FR-29 | Unknown barcodes rejected; never change stock | Built (23 Nov) | Selling and counting |
| Release 3 (rest) | Offline restocking and stock counting (a count must be started online) | Built (23 Nov, v1.4) | Stock, Stock Count; yellow "waiting" bar |
| FR-61 to FR-66 | Installed Windows and Android apps | Built (23 Nov, v1.4) | `desktop/`, `mobile/`, APPS.md |
| FR-67, FR-68 | Upright font; amounts from ₦1M shown short (₦2.53M) with the full amount on hover or tap | Built (23 Nov, v1.4) | Every screen except receipts |
| FR-69, FR-70, FR-75, FR-76 to FR-83 | Customer profiles; one-tap WhatsApp / email receipts and purchase history; sends recorded | Built (23 Nov, v1.5) | Sell → Customer box; Customers screen; receipt buttons |
| Release 4 | Receiving sessions with review | Not built | — |
| Release 5 | Voice guidance, tutorials, practice mode, French/Igbo | Not built | — |
| Release 6 | Product fields and units per trade | Not built | — |

## 3. Corrections to v1.2

- v1.2 lists **analytics** and **staff attribution on each sale** as missing. Both existed before v1.2 (built 22 Oct 2026): daily report with profit, best sellers and sales by staff; receipt numbers; staff on every sale. Mark them as "already built".
- Also built before v1.2 and worth listing as existing features: barcode scanning (camera, plug-in scanner, typed), auto-generated EAN-13 shop codes, A4 label printing, end-of-day money check by payment type, shop details on receipts, backups and restore, light/dark mode.

---

## 4. Release 7: Genuine Parts Trail — overview

### 4.1 Problem
Fake and substandard spare parts are common in Nigerian markets. Buyers cannot tell a genuine part from a copy at the counter. Honest dealers have no way to prove that their stock is genuine, so they compete on price with sellers of fakes.

### 4.2 Purpose
Give each genuine part a tag that a buyer can scan with any phone to see where the part came from and whether that tag has already been used. The record of each tag cannot be changed later without the change being detectable.

### 4.3 Positioning
The feature sells **trust**, not technology. Buyers and mechanics never see the words "blockchain", "wallet" or "token". They see: *"Genuine. Supplied to Emeka Motors on 3 March 2027 by [supplier]. First check today."*

### 4.4 Scope
**In scope**
- Unique, per-item tags (QR code plus a hidden claim PIN) issued by a shop.
- An event trail for each tag: issued, sold, claimed, transferred, voided, reported.
- A public verification page that needs no app and no sign-in.
- Tamper evidence: each day's records are fingerprinted and the fingerprint is anchored on a public blockchain.
- Copy detection (the same tag scanned or claimed in suspicious ways).

**Out of scope**
- Any cryptocurrency, token or NFT. No payments move on a blockchain.
- Holding customer money.
- Certifying that a part is genuine by inspection. The app records what the shop declares and who declared it. Responsibility for the declaration stays with the shop that issued the tag.
- Integration with manufacturers' own anti-counterfeit systems (possible later).

### 4.5 Phases

| Phase | What it delivers | Depends on |
|---|---|---|
| **7A — Shop tags** | One shop issues tags for parts it received from a supplier it trusts. Buyers verify and claim. Daily anchoring. | Releases 1–3 live |
| **7B — Supplier handoff** | A supplier (importer or wholesaler) issues tags; the dealer accepts them on receiving, so the trail starts upstream. | Multi-shop version, Release 4 (receiving sessions) |
| **7C — Mechanic and buyer network** | Mechanics confirm installation; public "verified dealer" badge and dealer directory. | 7B, enough shops on the system |

---

## 5. Users and roles

| Role | What they do in Release 7 |
|---|---|
| Owner (admin) | Turns the feature on, issues and voids tags, sees reports and copy alerts. |
| Staff | Prints and attaches tags; tags are linked to sales automatically when scanned at checkout. |
| Supplier (7B) | Issues tags for parts it sells to dealers. |
| Buyer / mechanic | Scans the QR on any phone, sees the trail, claims the part with the PIN. No account needed. |
| Verifier (anyone) | Can independently check that a tag's record matches its blockchain fingerprint. |

---

## 6. Functional requirements

### 6.1 Issuing tags
- **FR-30** The owner can turn Genuine Parts Trail on or off in Settings. When off, nothing in this release is shown.
- **FR-31** The owner can issue tags for a part in a quantity they choose, up to the stock on hand of that part, and must record where the stock came from: supplier name (required), supplier invoice or waybill number (required), and optionally a photo of the invoice.
- **FR-32** Each tag has a unique ID that cannot be guessed (at least 96 bits of randomness) and is different from the part's product barcode or shop code. One tag represents one physical item.
- **FR-33** Each tag carries a hidden **claim PIN** (6 characters), printed under a scratch-off panel or on the inside of a fold-over label. The server stores only a hash of the PIN.
- **FR-34** The app prints tags on the existing A4 label sheet (21 per page) and on thermal label printers once supported. Each tag shows: QR code, a short readable code (e.g. GP-7KQ2-M9XA), the shop name, and the claim PIN area.
- **FR-35** The owner can void a tag (lost, damaged, printed in error) with a reason. A voided tag shows as **VOID** on the verification page.

### 6.2 Selling with tags
- **FR-36** At checkout, scanning a tag adds its part to the sale and links that tag to the sale. Selling the part without scanning a tag still works, as now.
- **FR-37** A tag can be linked to only one completed sale. Scanning an already-sold tag at checkout shows a warning and does not add it.
- **FR-38** Cancelling or returning a sale (FR-03) unlinks its tags and puts them back to "in stock".
- **FR-39** The receipt (print and WhatsApp) lists the short codes of tagged items and the verification link.
- **FR-40** Tagged sales made offline (FR-11 to FR-13) keep the tag link and are checked against FR-37 when sent. If the tag was sold elsewhere in the meantime, the owner sees a red alert explaining why.

### 6.3 Public verification
- **FR-41** Scanning the QR opens a public page (no app, no sign-in) that loads on a basic Android phone over a slow connection. It shows:
  - status: **Genuine — in stock**, **Genuine — sold**, **Claimed**, **VOID**, or **Not found**;
  - part name, issuing shop and its phone number, supplier name, issue date, sale date (if sold);
  - number of times the tag has been checked and when it was first checked;
  - a "tamper-proof record" note with the anchoring date (section 6.6).
- **FR-42** The page never shows supplier invoice numbers, cost prices, staff names, or any buyer's personal data.
- **FR-43** A "Report a problem" button lets the viewer report a suspected fake with an optional photo and phone number. Reports go to the issuing shop's owner and to the platform admin.

### 6.4 Claiming
- **FR-44** A buyer can claim a sold part by entering the claim PIN on the verification page. The first correct claim marks the tag **Claimed** with the date.
- **FR-45** After a tag is claimed, the page shows "Already claimed on [date]" to anyone else. A second correct PIN entry shows "This part was already claimed. If you just bought it, it may be a copy" and creates a copy alert.
- **FR-46** PIN attempts are rate-limited: 5 wrong attempts lock claiming on that tag for 1 hour.

### 6.5 Copy detection
- **FR-47** The system raises a **copy alert** to the issuing shop when any of these happen:
  - the tag is checked from more than one distant location within 24 hours after it was claimed (coarse location from IP only; no GPS required);
  - a second claim attempt with the correct PIN (FR-45);
  - the tag is scanned at checkout in another shop on the network (7B);
  - more than 20 checks in 24 hours.
- **FR-48** The owner sees copy alerts on the Dashboard and in a Genuine Parts report: which tags, which alerts, and the reports filed (FR-43).

### 6.6 Tamper evidence (blockchain anchoring)
- **FR-49** Every tag event (issued, sold, unsold, claimed, voided, reported, transferred) is written to an append-only event log. Each event stores the hash of the previous event for the same tag, so the events of a tag form a chain.
- **FR-50** Once a day, the server computes a single fingerprint (Merkle root) of all events of that day and anchors it on a public blockchain. Phase 7A uses **OpenTimestamps** (free; anchored to Bitcoin; needs no wallet, coins or account). An EVM chain (e.g. Polygon or Base) is an option for later phases if faster confirmation is needed.
- **FR-51** For any tag, the system can produce a proof file showing that the tag's events were part of an anchored fingerprint. The verification page offers it as "Download proof" for technical users.
- **FR-52** Events are never edited or deleted. Corrections are new events (e.g. VOID) that refer to the earlier event.
- **FR-53** No personal data, phone numbers or photos go into the fingerprint inputs as readable text. Only hashes leave the server.

### 6.7 Supplier handoff (Phase 7B)
- **FR-54** A supplier account can issue tags for parts it sells. When a dealer receives the stock (Release 4 receiving session), scanning the tags transfers them to the dealer and adds a TRANSFERRED event.
- **FR-55** The verification page then shows the whole trail: supplier → dealer → buyer.
- **FR-56** Suppliers are marked **Verified supplier** only after the platform admin checks their CAC registration documents.

### 6.8 Mechanic confirmation (Phase 7C)
- **FR-57** A registered mechanic can mark a claimed part as "Installed by [workshop]" on a date.
- **FR-58** Shops whose tags have no unresolved copy alerts for 90 days earn a public **Verified dealer** badge on their verification pages.

### 6.9 Reports
- **FR-59** Genuine Parts report (owner): tags issued, in stock, sold, claimed, voided; claim rate; copy alerts; reports from buyers; tagged vs untagged sales.
- **FR-60** All Release 7 actions appear in the Activity Log in plain words ("Tags issued", "Tag voided", "Copy alert").

---

## 7. Use cases

### UC-05 Issue tags for new stock
**Actor:** Owner. **Pre-condition:** feature on; part has stock.
1. Owner opens a part → *Genuine tags* → *Issue tags*.
2. Enters quantity, supplier, invoice number; optionally photographs the invoice.
3. App creates the tags and opens the print sheet.
4. Staff attach one tag to each item.
**Result:** tags are "in stock"; ISSUED events recorded.

### UC-06 Sell a tagged part
**Actor:** Staff.
1. Staff scans the tag at checkout.
2. App adds the part and links the tag; warns if the tag is already sold or void.
3. Sale completes; receipt lists the tag code and verification link.
**Result:** tag is "sold"; SOLD event recorded.

### UC-07 Buyer verifies and claims
**Actor:** Buyer or mechanic.
1. Scans the QR with the phone camera.
2. Sees status, shop, supplier and dates.
3. Scratches the panel and enters the PIN.
4. Sees "Claimed — this part is registered to your purchase on [date]".
**Alternative:** already claimed → copy warning and alert (FR-45).

### UC-08 Handle a copy alert
**Actor:** Owner.
1. Dashboard shows a red copy alert.
2. Owner opens it, sees what triggered it, any buyer report and photo.
3. Owner marks it *Checked — not a problem*, *Tag voided*, or *Reported to authorities*, with a note.

### UC-09 Supplier hands off stock (7B)
**Actors:** Supplier, dealer staff.
1. Supplier issues tags and ships the goods.
2. Dealer starts a receiving session and scans the tags.
3. Tags transfer to the dealer; mismatches go to the owner's review screen.

---

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-30 | The verification page loads in under 3 seconds on a 3G connection and works on Android Chrome versions from the last 5 years. Page weight under 150 KB. |
| NFR-31 | Tag IDs and PINs are generated with a cryptographically secure random generator. PINs are stored only as salted hashes. |
| NFR-32 | Public endpoints are rate-limited per IP to stop scraping and PIN guessing. |
| NFR-33 | Plain English on all buyer-facing screens; reading level suitable for market traders. Igbo and French follow Release 5. |
| NFR-34 | Anchoring failure never blocks selling. If a day's anchoring fails, it retries and the owner sees a notice after 48 hours of failures. |
| NFR-35 | Event log can be exported in full (CSV and JSON) with proof files, so the record outlives the app. |
| NFR-36 | Works on the current hosting (Render free plan + Turso). Anchoring runs as a daily job inside the server or via the existing cron-job.org ping. |
| NFR-37 | Personal data handling follows the Nigeria Data Protection Act 2023: buyer phone numbers are optional, used only to reply to reports, and deleted after 12 months. |

---

## 9. Data model (additions)

| Table | Key fields |
|---|---|
| `tag_batches` | id, part_id, qty, supplier_name, invoice_ref, invoice_photo_url, issued_by, issued_at |
| `tags` | id (random), short_code, batch_id, part_id, shop_id, status (in_stock / sold / claimed / void), pin_hash, sale_id, claimed_at, check_count, first_checked_at |
| `tag_events` | id, tag_id, type, payload_json, actor, created_at, prev_hash, hash |
| `anchors` | id, day, merkle_root, method (opentimestamps / evm), proof_blob, status, anchored_at |
| `tag_alerts` | id, tag_id, reason, details_json, status, resolved_by, resolved_note, created_at |
| `tag_reports` | id, tag_id, message, photo_url, phone (optional), created_at |

New public endpoints: `GET /v/:tagId` (page), `GET /api/verify/:tagId`, `POST /api/verify/:tagId/claim`, `POST /api/verify/:tagId/report`, `GET /api/verify/:tagId/proof`.
New owner endpoints: issue, list, void, alerts, report.

---

## 10. Legal and regulatory notes

- Release 7 uses a blockchain only to timestamp hashes of records. It does not issue, hold, trade or transfer any virtual asset, and no money moves through it. Under Nigeria's functional approach, blockchain used for data falls under NITDA, while financial rails fall under the CBN and securities under the SEC. Release 7 is designed to stay in the data category.
- The CBN's Regulations for the Operations of Non-Security Virtual Assets took effect on 5 November 2026. Any later feature that moves money or stablecoins (for example, paying suppliers on-chain) would need CBN authorisation or a licensed partner and is **not** part of this release.
- Wording on tags and the verification page must say the record shows **what the issuing shop declared**, not that SpareParts Pro inspected the part.
- This section is a planning note, not legal advice. Get a lawyer's review before a public launch.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A QR can be photocopied | Scratch-off PIN and one-time claim (FR-44/45); copy alerts (FR-47); tamper-evident label stock later. |
| A dishonest shop tags fake parts | Supplier and invoice recorded on every batch; buyer reports go to the platform admin; Verified supplier/dealer badges depend on clean records (FR-56, FR-58); a shop can lose the feature for abuse. |
| Buyers don't bother to scan | Mechanics are the key audience: they scan to protect their own reputation. Receipt and shelf signage: "Scan before you pay." |
| Extra work for staff | Tags are printed in batches; selling with a tag is the same single scan as now. |
| Anchoring service or chain unavailable | Records stay valid in the event log; anchoring retries (NFR-34); a second anchoring method can be added. |
| Free hosting limits | Public page is light (NFR-30); move to a paid plan once tag volume justifies it. |

---

## 12. Acceptance tests (Phase 7A)

| # | Test | Expected result |
|---|---|---|
| AT-1 | Issue 5 tags for a part with 3 in stock | Refused: more than stock on hand. |
| AT-2 | Issue 3 tags; print sheet | 3 unique tags, each with QR, short code and PIN area. |
| AT-3 | Scan a tag at checkout and complete the sale | Tag status "sold"; receipt lists the code and link. |
| AT-4 | Scan the same tag in a new sale | Warning; tag not added. |
| AT-5 | Cancel the sale from AT-3 | Tag back to "in stock"; UNSOLD event recorded. |
| AT-6 | Open the verification link on a phone over a throttled 3G connection | Loads under 3 s; shows correct status; no cost, invoice or staff data visible. |
| AT-7 | Claim with the correct PIN | Status "Claimed". |
| AT-8 | Claim again with the correct PIN | Copy warning shown; owner gets a copy alert. |
| AT-9 | Enter 5 wrong PINs | Claiming locked for 1 hour. |
| AT-10 | Run the daily anchoring job | Anchor row created; proof downloadable; proof verifies with the standard OpenTimestamps verifier once confirmed. |
| AT-11 | Edit a tag event directly in the database, then verify the proof | Verification fails, showing the record was altered. |
| AT-12 | Make a tagged sale offline; sell the same tag online from another device; reconnect | Offline sale refused for that tag with a clear red alert to the owner. |
| AT-13 | Turn the feature off in Settings | No tag screens or receipt lines appear; existing verification pages still work. |

---

## 13. Open questions

1. Price model: per-tag packs, a monthly "Genuine" tier, or included in the multi-shop paid plan? (Test willingness to pay with the two testers.)
2. Which label stock: scratch-off stickers vs fold-over labels, and the local supplier for them.
3. Which parts to pilot first: fast-moving, often-faked items (brake pads, filters, plugs, bearings).
4. Who the first supplier partner for Phase 7B is.

---

## 14. Installed apps (added in v1.4)

**Decision (23 Nov 2026):** installed apps that share the one online data store, rather than a fully local database per device. The PC, phones and website always see the same stock and sales; offline work waits on the device and is sent later.

| ID | Requirement | Status |
|---|---|---|
| FR-61 | A Windows app (.exe installer and portable .exe) with its own icon, window and desktop shortcut. | Built (Electron, `desktop/`) |
| FR-62 | An Android app (.apk) with its own icon; camera scanning works inside the app. | Built (Capacitor, `mobile/`); APK built by GitHub Actions |
| FR-63 | The app's screens are stored inside the app, so it opens instantly and with no internet; the barcode reader, icons and fonts are stored inside too. | Built |
| FR-64 | Without internet, the app stays signed in and shows the last stock list received. The server still checks every action when it arrives. | Built |
| FR-65 | Sign-in screen lets the user set the shop's server address (each tester's shop has its own). Changing it clears the old shop's sign-in and stock list. Offline work is kept per shop server and per person. | Built |
| FR-66 | Restocks sent from the app carry a device reference; the server adds each restock once only, even if it arrives twice (same rule as sales, FR-14). | Built (`op_refs` table) |

**Not covered:** an iPhone app (needs a Mac and an Apple Developer account, $99/year); iPhone users add the website to the Home Screen. Play Store publishing (Google Play account, one-time $25, signed release build) is a later step. Printing from the Android app is not supported; receipts are shared instead.

**Acceptance tests**
| # | Test | Expected result |
|---|---|---|
| AT-14 | Open the app with the network off, after one earlier online sign-in | App opens signed in; stock list from the last connection; yellow notice. |
| AT-15 | Restock and count offline; reconnect | Both are sent in order; stock on the server matches the device; nothing added twice. |
| AT-16 | Send the same restock reference twice | Stock goes up once; second reply marked duplicate. |
| AT-17 | Change the server address on the sign-in screen | Address checked first; old sign-in cleared; new shop's name shown. |

## 15. Display rules (added in v1.4)

| ID | Requirement | Status |
|---|---|---|
| FR-67 | Headings and numbers use a plain, upright font (Inter), stored inside the app; codes use IBM Plex Mono. Numbers line up in columns. | Built |
| FR-68 | On screen, amounts of ₦1,000,000 and above are written short with two decimals (₦2.53M, ₦1.20B); summary cards also shorten from ₦100,000 (₦850K). Hovering (computer) or tapping (phone) shows the exact amount. Receipts, WhatsApp receipts and printed labels always show the full amount. | Built |

## 16. Digital receipts — feasibility study (added in v1.4)

**Question:** can a receipt be sent to the customer automatically by email or phone after each sale?

**Short answer:** yes. Email and a one-tap WhatsApp send are free and can be built now. Fully automatic WhatsApp or SMS works but costs money per receipt and needs registration with Meta or the mobile networks, so it should wait until the testers show customers want it.

### 16.1 Findings (checked 23 Nov 2026)

| Channel | How | Cost | Set-up burden | Notes |
|---|---|---|---|---|
| WhatsApp, one tap (from the shop's own WhatsApp) | App opens WhatsApp with the customer's number and the receipt already typed; staff tap Send. | Free | None | Already half-built: the Share button. Needs the customer's phone number on the sale. |
| Email, automatic | Server sends through an email service's web API (Brevo). | Free up to 300 emails/day (Brevo Free plan); "Sent with Brevo" note on free emails. | An account and an API key per installation. | Render's free plan blocks normal email ports (SMTP) since Sept 2025, so the web API must be used. Many walk-in customers have no email. |
| WhatsApp, automatic (WhatsApp Business Platform) | Server sends an approved "utility" template message. | About ₦14 per receipt (Meta rate for Nigeria, from 1 Oct 2026). | Meta business verification, a dedicated phone number, approved template; per shop. | Most familiar channel for Nigerian buyers. |
| SMS, automatic | Through a Nigerian provider (e.g. Termii) on a transactional route. | About ₦6.50 per SMS page; a receipt with the ₦ sign drops to 70 characters a page, so 2–3 pages (₦13–20). | Alphanumeric sender ID must be registered with every network; transactional IDs need NCC approval and company (CAC) papers. | Reaches any phone, including non-smartphones. Write "NGN" instead of "₦" to keep pages down. |
| Receipt link page | Each sale gets a private, hard-to-guess link showing the receipt; the link goes out by any channel above. | Free | None | Short SMS/WhatsApp messages; the same page can later show Genuine Parts Trail tags (Release 7). |

### 16.2 Proposed requirements

| ID | Requirement | Phase |
|---|---|---|
| FR-69 | A sale can record the customer's phone number and/or email (both optional), with a tick box for consent to receive the receipt. | A — **built v1.5** |
| FR-70 | After a sale, buttons: **WhatsApp receipt** (opens WhatsApp to that number, text ready), **Email receipt**. The owner can set either to happen automatically. | A — **built v1.5** as one-tap buttons; email opens the device's mail app instead of a server email service, so FR-72 is not needed for now |
| FR-71 | Each receipt gets a public link with an unguessable reference; the page shows only what the paper receipt shows (no cost, staff or stock data). | A |
| FR-72 | Email receipts are sent through a provider's HTTPS API (not SMTP); the API key is set as a server setting, never in the app. | A |
| FR-73 | Sends made offline wait in the offline queue with the sale and go out when the sale reaches the server. | A |
| FR-74 | Automatic WhatsApp (Business Platform) and SMS sending, with a monthly message budget and a count on the Reports screen. | B |
| FR-75 | **Built v1.5 (sent records in the Activity Log).** The receipt record shows whether and how it was sent (sent / failed / not sent). Customer contact details follow the Nigeria Data Protection Act 2023 (consent, no marketing without opt-in). | A and B |

### 16.3 Recommendation
Build Phase A (free) with the tester release: phone number on the sale, one-tap WhatsApp, email through Brevo's API, and the receipt link page. Ask the testers whether customers use them, then decide on Phase B (about ₦14 per WhatsApp receipt or ₦13–20 per SMS receipt), which could be charged to shops as a paid add-on.

**Same idea outside spare parts:** the same receipt engine could send school fee receipts, or short learning-support session notes, to parents by WhatsApp or email.

## 17. Customer profiles and one-tap receipts (added in v1.5)

**Decision (23 Nov 2026):** go with option 1 from section 16: receipts are sent from the shop's own WhatsApp (or mail app) in one tap. No per-message cost, no Meta or NCC registration. Customers get a profile so each receipt, and the whole chain of their past purchases, can be sent to the right number or email.

### 17.1 Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-76 | A customer profile holds name (required), phone, email, a note, and consent to receive receipts by WhatsApp / email. Phone numbers are stored in one standard form (+2348031234567) whatever way they are typed (0803…, 234803…, +234 803…); numbers from other countries start with + and the country code. Letters in a phone number are refused. | Built |
| FR-77 | One phone number belongs to one customer. A new customer typed with a phone that is already saved is matched to the existing profile (also for sales made offline on two devices). | Built |
| FR-78 | On the Sell screen, the customer box searches saved customers by name, phone or email as you type (works offline from the last list received), or adds a new customer with phone and email. Leaving it empty is a walk-in sale; typing a name only keeps the name on the receipt without a profile. | Built |
| FR-79 | Every sale with a profile is linked to the customer. Renaming a customer updates the name on their receipts. | Built |
| FR-80 | The receipt shows **WhatsApp [name]** (opens WhatsApp to that customer's number with the receipt typed) and **Email** (opens the mail app with the receipt), when a phone or email is saved. Without a phone it falls back to the normal Share. | Built |
| FR-81 | Customers screen (staff and owner): search; visits, total spent and last visit per customer; profile with every purchase (items, totals, cancelled ones marked); edit; add. | Built |
| FR-82 | **Purchase history** ("statement") from the profile: the customer's purchases, newest first (up to 15, then "…and N earlier purchases"), with the total spent, sent by WhatsApp or email. | Built |
| FR-83 | The owner can **Forget** a customer: phone and email are deleted, past sales stay on record with the name (Nigeria Data Protection Act 2023 — right to erasure). Every add, edit, removal and send is in the Activity Log. | Built |

### 17.2 Rules
- A sale made offline is never lost because of a mistyped phone number: the server saves it with the name only and no profile (FR-73).
- Staff can see a customer's purchase history (to resend receipts) but never cost prices.
- Sending uses the shop's own WhatsApp / email account on that device. WhatsApp must be installed (or WhatsApp Web open on the PC).
- Messages are only for receipts and purchase history. Promotions need the customer's separate opt-in and are not part of this release.

### 17.3 Acceptance tests
| # | Test | Expected result |
|---|---|---|
| AT-18 | New customer during a sale: name, phone "0809 555 1234", email | Profile created with +2348095551234; receipt shows WhatsApp and Email buttons |
| AT-19 | Tap WhatsApp on that receipt | WhatsApp opens to 2348095551234 with the receipt text; "Receipt sent" appears in the Activity Log |
| AT-20 | Type "0809" in the customer box | The saved customer appears with phone and visit count |
| AT-21 | Offline sale with a new customer and phone; reconnect | Sale and profile both saved on the server |
| AT-22 | Phone "0809 555 1234abc" | Refused with "Phone number doesn't look right" |
| AT-23 | Same phone added as a new customer on a second sale | Matched to the existing profile, no duplicate |
| AT-24 | WhatsApp history from the profile | Message lists each purchase (date, receipt, items, amount) and the total spent |
| AT-25 | Owner taps Forget | Phone and email gone; past sales still show the name |

### 17.4 Next options
- Receipt link page (FR-71), so a short message can carry a link instead of the full receipt; later the place to show Genuine Parts Trail checks (Release 7).
- Fully automatic WhatsApp / SMS (FR-74, Phase B), if testers' customers want receipts without staff tapping Send.
- Same feature outside spare parts: a school could keep parent profiles and send fee receipts or learning-support session notes the same way.

