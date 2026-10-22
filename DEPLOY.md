# Putting SpareParts Pro online so data is never lost

## Why this is needed
On Render's free plan, the server's files are wiped every time it restarts, updates, or goes to sleep
(it sleeps after 15 minutes with no visitors). So every sale and stock change was being lost.
The fix is a small paid server that never sleeps, plus a permanent 1 GB disk for the data.

Cost: about $7.25 a month ($7 server + $0.25 for the 1 GB disk). Render also copies the disk automatically every day and keeps each copy for 7 days.

## Steps (existing Render service)

1. **Upload the new code to GitHub** — the same repository Render deploys from.
   The `.gitignore` file stops database files and backups from being uploaded (they contain staff logins and sales).

2. **Render → your service → Settings**
   - Root Directory: leave **empty** (so the app pages and the server are both included)
   - Build Command: `npm install`
   - Start Command: `npm start` (the old `node server.js` also still works)
   - Health Check Path: `/api/health`
   - Instance Type: **Starter** (0.5 CPU, 512 MB)

3. **Render → your service → Disks → Add Disk**
   - Name: `spareparts-data`
   - Mount Path: `/var/data`
   - Size: `1` GB

4. **Render → your service → Environment → Add**
   - `DB_PATH` = `/var/data/spareparts.db`
   - `TZ_OFFSET_HOURS` = `1`

5. **Deploy.** Then open `https://<your-service>.onrender.com`:
   - Sign in with `admin` / `admin123`. You'll be asked to choose a new password.
   - Dashboard: there must be **no red warning box**. If there is one, step 4 was missed.
   - Manage Users → Backups should say "Automatic daily copies start today".

6. **Optional — bring in existing data:** Manage Users → Backups → Restore from a backup → choose a backup `.db` file.

## Starting fresh instead (new service)
Render → New → Blueprint → pick the repository. `render.yaml` sets up everything in steps 2–4 automatically
(server in Frankfurt, the closest region to Nigeria).

## Keeping data safe — three layers
1. Permanent disk: data survives restarts and updates.
2. Automatic copies: the app saves one copy a day on the disk (last 30 days); Render snapshots the disk daily (7 days).
3. **Your own copy:** once a week, Manage Users → Download backup, and put it in Google Drive.
   This is the copy that saves you if the Render account itself ever has a problem.

## Running it on this computer
    cd backend
    npm install
    npm start
Open http://localhost:5000
