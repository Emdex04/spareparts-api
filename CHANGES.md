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
