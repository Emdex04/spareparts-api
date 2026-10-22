# SpareParts Pro — where things stand (22 Oct 2026)

## Live now
- App: https://spareparts-api-4343.onrender.com (Render free plan)
- Data: Turso online database — kept safe through restarts (check: /api/health shows "storage":"turso")
- Code: GitHub Emdex04/spareparts-api, branch `main` → Render updates automatically on every push
- This desktop folder matches GitHub.

## Done today
1. Security: secure sign-in, scrambled passwords, forced password change, lockout after wrong tries
2. Sales with several items, receipts (print / WhatsApp), payment method, sales history
3. Daily report: sales, profit, best sellers, by staff, end-of-day money check
4. Barcodes: phone camera, plug-in scanner, typed codes; printable A4 labels
5. Hosting: free Render + Turso, backups (download / restore)
6. New look: light & dark mode, phone layout, friendly dates and ₦ amounts
7. Shop details (business name, address, phone) on receipts — Settings → Shop details

## Still to do on the live app
- [ ] Sign in, set your password, enter your business name in Settings
- [ ] Delete the 3 sample parts, add real ones
- [ ] cron-job.org: ping https://spareparts-api-4343.onrender.com/api/health every 10 minutes (keeps it awake)
- [ ] Download a backup weekly (Settings → Backups)

## NEXT: testers (your parents) — Option B, one copy each
For each tester (shop1, shop2):
1. Turso → Create Database `shop1` (Europe) → copy URL (libsql://…) → Create Token (Read & Write, Never) → copy
2. Render → New → Web Service → Emdex04/spareparts-api
   - Name `spareparts-shop1`, Region Frankfurt, Branch main, Root empty
   - Build `npm install`, Start `npm start`, Instance Free
   - Environment: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, TZ_OFFSET_HOURS = 1 → Deploy
3. Check /api/health shows "storage":"turso"; sign in admin/admin123, set a temporary password,
   enter their business name, delete sample parts
4. WhatsApp them: link, username admin + temporary password, "change password first",
   "Chrome ⋮ → Add to Home screen", "first load after a quiet spell takes ~1 minute"
Test for 2 weeks; ask: what confused you, what was missing, would you pay ₦X a month?

## Later (decide after testing)
- Multi-shop version (one app, many shops) + Paystack paywall
  (card, bank transfer incl. OPay/PalmPay users, USSD, international cards; Stripe directly needs a foreign company)
- Optional: split "Paid by" into Cash / POS / OPay / PalmPay / Bank transfer for the end-of-day check
- Thermal label printer layout once you buy one

Details: DEPLOY.md (hosting steps), CHANGES.md (everything that changed).
