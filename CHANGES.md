# SpareParts Pro — changes on 22 Oct 2026

## Security
- Sign-in now uses a secure token. The old "x-user-id" header no longer works.
- Passwords are stored scrambled (scrypt). Existing passwords are converted automatically the first time the server starts.
- Anyone still on admin123 or staff123 must choose a new password at their next sign-in. New staff accounts also pick their own password at first sign-in.
- 5 wrong passwords lock that username for 10 minutes.
- Editing a part only accepts name, SKU, price, cost and minimum stock. Nothing else in the request is used.
- Staff can restock but can't lower stock. Only an admin can correct stock down, and must give a reason (saved in the audit log).
- Staff no longer see cost prices or profit.

## New features
- Sales with several items per customer, a receipt number (R-YYYYMMDD-0001), and an optional customer name.
- Receipt screen with Print and Share (WhatsApp).
- Sales History for any date (staff see their own sales; admins see everyone's).
- Daily Report (admin): sales, items sold, profit, average sale, last 7 days, best-selling parts, and sales by staff.
- Cost price per part, so profit can be worked out.
- Edit Part screen (admin): name, SKU, selling price, cost price, low-stock level and stock correction.
- Change Password button (on mobile it's the key icon at the top of the Dashboard, next to Sign Out).
- The app remembers you're signed in for 7 days.

## Server
- Uses the PORT setting given by the host (needed on Render).
- Times are saved in Lagos time (change with TZ_OFFSET_HOURS).
- The server also serves the app itself, so http://localhost:5000 opens it directly.

## Run locally
    cd backend
    npm install
    npm start
Then open http://localhost:5000

Backup of the previous version: _backup_2026-10-22

---

# Barcodes and end-of-day money check — 22 Oct 2026 (second update)

## Scanning
- **Phone/laptop camera:** Sales → Camera. Each beep adds 1 to the sale. Holding a part in view never counts it twice; move it away and back (or tap +) for another.
- **Plug-in scanners (USB or Bluetooth):** click the "Scan or type barcode" box and scan. They type the code and press Enter for you.
- **Typing works too:** type a barcode, SKU or shop code and press Enter.
- The camera needs the app to be opened over https:// (Render is) or on this computer.

## Barcodes on parts
- Add Part and Edit Part have a Barcode field with a camera button, for parts that already have a barcode on the box.
- Parts without a barcode get a **shop code** automatically, for example 2000000000046. It's an EAN-13 in the 20–29 range, which is set aside for a shop's own items, so it never clashes with a real product's barcode.
- The same barcode can't be put on two parts.

## Printing labels (admin → Barcode Labels)
- Choose how many labels per part, or tap "One per item in stock".
- Prints 21 labels per A4 page (63.5 × 38.1 mm each). Plain paper works now (cut and tape); A4 sticker sheets of this size fit exactly later.
- "Show price on label" is off by default, so labels don't go out of date when prices change.
- In the print window choose: Paper A4, Scale 100% / "Actual size", Margins "Default".

## Payment method and end-of-day check
- Every sale must record how the customer paid: Cash, POS or Transfer. It shows on the receipt.
- Daily Report → End-of-Day Money Check: enter cash in the drawer, the POS terminal's end-of-day total and transfers received. The app shows what matches and what is short or over, by payment type. Saving it is logged in the audit log.

---

# Hosting and data safety — 22 Oct 2026 (third update)
- Database is saved safely: written to a temporary file first, then swapped in, so a crash can't corrupt it.
- Set `DB_PATH` to keep the database on a permanent disk. On first start it brings across the existing data if any.
- Automatic daily copy of the database (last 30 days kept) next to it in `backups/`.
- Admins see a red warning on the Dashboard if the server isn't saving data permanently.
- Manage Users → Backups: download a full backup, or restore from one (current data is kept as a safety copy first).
- `render.yaml` and `DEPLOY.md` for setting up Render with a permanent disk.

---

# Free hosting with Turso — 22 Oct 2026 (fourth update)
- Data can now live in Turso (free online database). Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` on Render.
  Without them, data is kept in `backend/spareparts.db` (on this computer).
- Every sale is saved in one transaction: either the whole sale is recorded, or nothing is deducted.
- Server errors are caught and answered cleanly instead of crashing the server.
- Backup download and restore work the same with Turso or a local file; restore no longer needs a restart
  and accepts backups from older versions of the app.
- `render.yaml` switched to the free plan; `DEPLOY.md` rewritten with the Turso and keep-awake steps.

---

# New look and shop details — 22 Oct 2026 (fifth update)
- Redesigned screens: clearer layout, light and dark mode (follows the phone's setting; switch any time).
- Phones: bottom bar with a big Sell button and a More menu; tables turn into easy-to-read cards.
- Dates and times read naturally ("Today, 2:25 pm", "Thursday, 22 October 2026"); money shows as ₦13,000,
  with large totals shortened on summary cards (₦1.27m) — the full figure shows on hover.
- Long codes are hidden: receipts show "No. 7", parts show a small "Barcode" tag, labels say "Shop barcode".
- Dashboard: greeting, clickable summary cards, today's sales and a "Reorder soon" list.
- Settings → Shop details: business name, address, phone and receipt message. They appear on receipts,
  WhatsApp receipts, the sign-in screen and the top of the app.
- Activity log uses plain words ("Stock added", "Day check") and money with commas.
- All styling moved out of index.html into style.css.

---

# SRS v1.2 updates — 23 Nov 2026
Built from the SpareParts Pro document pack (SRS v1.2, Brainstorming Register, Business Proposal v2).
Backup of the version before this: `_backup_2026-11-23`.

## Accountability (SRS Release 1)
- **Sign-ins are recorded** (E-FR-03): every sign-in, sign-out, wrong password and 10-minute lock appears in the Activity Log with the time.
- **Cancel or return a sale** (FR-03): owner opens a receipt → *Cancel / return* → picks "entered by mistake" or "customer brought it back" and gives a reason.
  The parts go back into stock. The sale is never deleted: it stays in the list crossed out, the receipt shows CANCELLED/RETURNED with who, when and why,
  and it is left out of every total, report and the end-of-day money check.
- **A sale is never saved twice** (FR-14): each sale carries its own reference from the phone. A double tap, a retry or a sale re-sent after
  the internet comes back returns the first sale instead of making a second one and deducting stock twice.
- Each sale already carried the signed-in staff member, a receipt number and time (FR-01, FR-02) — kept as it was.

## Stock control (SRS Release 2)
- **New Stock Count screen** (FR-04, FR-05, UC-02), for staff and owner:
  1. *Start counting* (optionally name it, e.g. "Shelf A").
  2. Scan items (each beep adds one — scans here never sell anything) or type the number seen for each part.
  3. Staff press *Send to owner*. The owner sees a red number on Stock Count, opens the count and sees each difference.
  4. Owner ticks the parts to correct, writes a note, and approves — or *Sets aside* the count with no stock change.
- Corrections move stock by the difference found **at the time of counting**, so sales made after the count are not undone.
- Every step is in the Activity Log. The screen reminds the owner that a difference is something to check, not proof of theft.
- Unknown barcodes are rejected clearly in counting and selling; they never change stock (FR-29).

## Reports (FR-06, FR-07)
- Reports now has **Day / Week / Month**. Week = the 7 days ending on the chosen date; Month = that date's calendar month.
- Week and month show: sales, profit (only from parts with a cost price, clearly labelled), items sold, current stock value,
  day-by-day chart, best sellers, **parts not selling** (in stock but no sales, with money tied up), sales by staff, how customers paid,
  and how many sales were cancelled and stock corrections made.
- The daily report now leaves out cancelled sales and says how many there were.

## Working without internet (SRS Release 3 — first step)
- **Sales keep working offline** (FR-11–FR-13, UC-04): if there is no connection when *Complete sale* is pressed, the sale is kept on the phone,
  the stock on screen goes down, and a yellow bar shows "1 sale waiting to be sent". It is sent automatically when the internet returns
  (or press *Send now*). The sale keeps the time it really happened and is marked "recorded offline".
- If the server refuses an offline sale (e.g. someone else sold the last one meanwhile), a red bar explains why so the owner can check.
- The app now opens without internet (it is saved on the phone), stays signed in, and shows the stock list from the last connection.
- Fixed: before, a sale pressed while offline could show "Sale saved — ₦NaN" and empty the cart without saving anything.
- Fixed: a short internet drop when opening the app no longer signs the user out.
- Still online-only: stock counts, adding/editing parts, restocking and reports.

## Not built yet (later releases in the SRS)
Text-to-speech and guided tutorials, French/Igbo, practice mode (Release 5); configurable product fields and units for other trades (Release 6);
offline counts/receiving; stock receiving sessions with a review screen.

---

# Windows and Android apps — 23 Nov 2026 (later)
- **Windows app** (`desktop/`) and **Android app** (`mobile/`): SpareParts Pro installed with its own icon, opening instantly
  even with no internet. Data stays on the shop's online server, shared by the PC, phones and website. See **APPS.md**.
- GitHub builds the Windows installer and the Android .apk for free (`.github/workflows/build-apps.yml`).
- Sign-in screen in the apps: **Change** the shop server address (for testers with their own shop copy).
- **Offline now covers restocking and stock counting too**, not just sales. Everything waits on the device and is sent
  in order when the internet is back; restocks, like sales, can never be added twice (server checks each one's reference).
- The barcode reader and icons are now inside the app (`frontend/vendor/`) instead of loaded from the internet,
  so scanning works offline on the website too.
- Friendlier messages when offline on the dashboard and sales list.

---

# Look and big numbers — 23 Nov 2026 (night)
- New font: headings and numbers use **Inter**, a plain upright font, instead of the wide decorative one. Stored inside the app
  (`frontend/vendor/fonts/`), so it looks the same offline. Numbers line up in columns.
- Big amounts read short: from ₦1,000,000 they show as **₦2.53M** (₦1.20B for billions); summary cards also shorten from
  ₦100,000 (₦850K). Point at the amount on a computer, or tap it on a phone, to see the exact figure.
  Receipts, WhatsApp receipts and printed labels always show the full amount.
- SRS updated to v1.4 (`docs/SRS.md`): build status, installed apps, display rules, and the digital receipts feasibility study.

---

# Customer profiles and one-tap receipts — 23 Nov 2026 (late night)
- **Customers**: name, phone, email, note and consent. Phone numbers are saved one way (+2348031234567) however they're
  typed; one phone = one customer, even when added on two devices offline.
- **Sell screen**: the customer box searches saved customers by name or phone as you type, or adds a new one with phone/email.
- **Receipt**: *WhatsApp [name]* opens WhatsApp straight to the customer's number with the receipt typed; *Email* opens the
  mail app. Free — it sends from the shop's own WhatsApp / email.
- **Customers screen** (new, for staff and owner): visits, total spent, last visit; each customer's full purchase list;
  **WhatsApp history / Email history** sends the chain of their purchases with the total spent.
- Owner can **Forget** a customer (contact details deleted, sales kept). Adding, editing, forgetting and sending are logged.
- Offline: customers can be added during an offline sale; a mistyped phone never stops an offline sale from saving.
- SRS v1.5 (`docs/SRS.md`, section 17).
