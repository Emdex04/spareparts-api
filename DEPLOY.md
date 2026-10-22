# Putting SpareParts Pro online — free setup

The app runs on Render's free plan and keeps its data in a free Turso database.
Render's free server wipes its own files whenever it restarts or sleeps, which is why the data must live in Turso.

## 1. Create the database in Turso (once)
Use your phone's mobile data if the school network blocks turso.tech.
1. Sign in at https://app.turso.tech
2. **Create Database** → name: `spareparts` → location: the one closest to Europe/Frankfurt → Create.
3. Open the database and copy its **URL**. It looks like `libsql://spareparts-yourname.aws-eu-west-1.turso.io`
4. Click **Create Token** (or "Generate token") → access: **Read & Write** → expiration: **Never** → copy the token.
   Treat this token like a password: don't post it anywhere or put it in the code.

## 2. Give Render the two values
Render → your service → **Environment** → **Add Environment Variable**:
- `TURSO_DATABASE_URL` = the URL from step 3
- `TURSO_AUTH_TOKEN`   = the token from step 4
- `TZ_OFFSET_HOURS`    = `1`
Save. Render restarts the app by itself (about 2 minutes).

## 3. Check it worked
Open `https://<your-service>.onrender.com/api/health`. It must show `"storage":"turso"` and `"storage_permanent":true`.
Then sign in with `admin` / `admin123` (you'll be asked to set a new password). The red warning on the Dashboard is gone.

## 4. Keep it awake (free)
The free server sleeps after 15 minutes without visitors and then takes about a minute to wake up.
1. Create a free account at https://cron-job.org
2. **Create cronjob** → URL: `https://<your-service>.onrender.com/api/health` → every **10 minutes** → Save.
Render's free plan gives 750 hours a month, enough for one app to stay on all month.

## Keeping data safe
- Turso stores the data online; restarts and updates don't touch it.
- Once a week: Manage Users → **Download backup**, and keep the file in Google Drive.
- Manage Users → **Restore from a backup** puts a backup file back (it replaces all current data).

## Render settings (already correct for an existing service)
Root Directory: empty · Build Command: `npm install` · Start Command: `npm start` (or `node server.js`)

## Running it on this computer
    cd backend
    npm install
    npm start
Open http://localhost:5000 — with no Turso settings it keeps data in `backend/spareparts.db`.
