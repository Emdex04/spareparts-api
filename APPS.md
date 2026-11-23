# SpareParts Pro apps — Windows and Android

The apps are SpareParts Pro installed on the device with their own icon. The screens live inside the app,
so it opens instantly, even with no internet. The shop's data stays on the shop's online server
(Render + Turso), so the PC and every phone see the same stock and sales.

**Without internet, the apps keep working:**
- Selling, adding stock (restock) and stock counting carry on. Everything is kept on the device and sent
  automatically when the internet is back, in the order it happened, never twice.
- The app opens and stays signed in, using the stock list from the last connection.
- Online-only for now: reports, adding/editing parts, sales history, starting a new stock count, staff and backups.

## 1. Try the Windows app now (no install)
1. Open `Downloads\SpareParts_Pro_Document_Pack_2026-11-17\SpareParts-Pro-Windows-test.zip`.
2. Right-click → **Extract All** → open the extracted folder → double-click **SpareParts Pro.exe**.
3. Windows may say "Windows protected your PC" (the app isn't signed with a paid certificate yet):
   click **More info → Run anyway**. You only do this once.
4. Sign in as usual. To pin it: right-click the icon on the taskbar → **Pin to taskbar**.

## 2. Get the proper installer + Android app (built free by GitHub)
1. Push this folder to GitHub (branch `main`), the same way as before. The website on Render updates as usual.
2. On github.com open **Emdex04/spareparts-api → Actions → Build apps**. It starts by itself
   (about 10 minutes). If it didn't, click **Run workflow**.
3. When it shows a green tick, open it and scroll to **Artifacts**:
   - `SpareParts-Pro-Windows` → contains `SpareParts-Pro-Setup-1.0.0.exe` (installer, adds a desktop
     shortcut) and `SpareParts-Pro-Portable-1.0.0.exe` (runs without installing).
   - `SpareParts-Pro-Android` → contains `SpareParts-Pro-Android.apk`.
4. **Easier for testers:** make a release. On GitHub: **Releases → Draft a new release → Choose a tag**,
   type `v1.0.0` → **Publish**. GitHub builds both apps and attaches them to that release page;
   send the testers that link.

## 3. Install on an Android phone
1. Send `SpareParts-Pro-Android.apk` to the phone (WhatsApp to yourself, Google Drive, or the release link).
2. Tap it. Android asks to allow installing from this source (Chrome / WhatsApp / Files) — allow it once.
3. Tap **Install**, then open **SpareParts Pro**. Allow the camera the first time you scan.
   (It isn't on the Play Store, so Play Protect may ask "Install anyway?" — tap it.)

## 4. iPhone
An iPhone app needs a Mac and an Apple Developer account ($99 a year), so it can't be built here.
On iPhone: open the shop's web address in **Safari → Share → Add to Home Screen**. It gets an icon and
works like an app, including selling offline once it has been opened online.

## 5. Each tester's own shop (Option B)
Each tester's shop has its own server address. On the sign-in screen of the app, tap **Change** under the
cloud icon, type their address (e.g. `spareparts-shop1.onrender.com`) and tap **Check & save**.
The app remembers it. Sales kept offline are tied to that shop and that person, so nothing goes to the wrong place.

## Good to know
- **Updates:** the apps carry their own copy of the screens. After you change the app, GitHub builds new
  versions; install the new Setup .exe / .apk over the old one. Data is not affected (it's on the server).
  To change the version number, edit `"version"` in `desktop/package.json` and `mobile/android/app/build.gradle` (versionName).
- **Printing** receipts and labels works in the Windows app. On Android, use **Share** (WhatsApp) for receipts.
- **Backups:** download them from the Windows app or the website, not from the Android app.
- **Play Store later:** needs a Google Play developer account (one-time $25) and a signed release build;
  ask when you're ready.

## Folders
- `frontend/` — the screens, shared by the website and both apps (`vendor/` holds the barcode reader and icons so they work offline)
- `desktop/` — the Windows app (Electron). Build on a Windows PC: `cd desktop`, `npm install`, `npm run dist`
- `mobile/` — the Android app (Capacitor). `mobile/android` opens in Android Studio
- `scripts/copy-web.js` — copies `frontend/` into each app before building
- `.github/workflows/build-apps.yml` — the GitHub build
