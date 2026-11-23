# SpareParts Pro — Software Requirements Specification

**Version:** 1.3 (update to SRS v1.2)
**Date:** 23 November 2026
**Owner:** Perpetua Ijeoma Muokwe
**Status:** Draft. Release 7 is planned to start after the SRS v1.2 updates are live and the tester period has ended.

> **How to read this version.** SRS v1.2 (part of the SpareParts Pro document pack, with the Brainstorming Register and Business Proposal v2) remains the base document. This file records:
> 1. the build status of every v1.2 requirement as of 23 Nov 2026 (section 2),
> 2. corrections to v1.2 (section 3),
> 3. the new **Release 7: Genuine Parts Trail** (sections 4–12).
>
> Requirement IDs from v1.2 (FR-01 to FR-29, E-FR-03, UC-01 to UC-04, Releases 1–6) keep their numbers. New items start at FR-30 and UC-05 so nothing clashes. When v1.2's full text is merged into this file, sections 2 and 3 replace v1.2's status notes.

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.2 | Nov 2026 | Base document (document pack): Releases 1–6. |
| 1.3 | 23 Nov 2026 | Build status of Releases 1–3 recorded. Corrections to "missing features" list. Release 7 (Genuine Parts Trail) added, with its requirements, use cases, data model, risks and acceptance tests. Release order updated. |

---

## 1. Release plan (updated)

| Release | Content | Status (23 Nov 2026) |
|---|---|---|
| 1 | Accountability: staff on each sale, receipt numbers, sign-in records, cancel/return with reason, no double-saved sales | **Built.** Not live until pushed to GitHub. |
| 2 | Stock control: stock count sessions, owner review of differences | **Built.** Not live until pushed. |
| 3 | Working offline | **Partly built.** Offline sales done; offline counts and receiving not done. |
| 4 | Stock receiving sessions with review screen | Not started |
| 5 | Guided tutorials with voice, practice mode, French/Igbo | Not started |
| 6 | Configurable product fields and units for other trades (bearings, plastics, electrical) | Not started |
| — | Tester period (2 shops, about 2 weeks) | Next, after push |
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
| Release 3 (rest) | Offline stock counts and receiving | Not built | — |
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
