const express   = require("express");
const cors      = require("cors");
const path      = require("path");
const fs        = require("fs");
const crypto    = require("crypto");
const initSqlJs = require("sql.js");                 // only used to build/read backup files
const { createClient } = require("@libsql/client");

const app  = express();
const PORT = process.env.PORT || 5000;              // Render sets PORT itself
const TZ_OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? 1); // Lagos = UTC+1
const SESSION_DAYS    = 7;

app.use(cors());
app.use(express.json({ limit: "200kb" }));

/* =========================
   WHERE THE DATA LIVES
   - Online (Render): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN → data is kept in Turso.
   - On this computer: nothing to set → data is kept in backend/spareparts.db.
   - Or DB_PATH → a file on a permanent disk.
========================= */
const TURSO_URL   = process.env.TURSO_DATABASE_URL || "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || "";
const USING_TURSO = !!TURSO_URL;
const LOCAL_DB    = path.join(__dirname, "spareparts.db");
const DB_PATH     = process.env.DB_PATH || LOCAL_DB;
const BACKUP_DIR  = path.join(path.dirname(DB_PATH), "backups");
const BACKUPS_KEPT = 30;
// On Render without Turso or a disk, the app's folder is wiped on every restart.
const STORAGE_PERMANENT = USING_TURSO || !process.env.RENDER || !!process.env.DB_PATH;

let client;   // the database connection
let SQL;      // sql.js, for backup files

/* =========================
   TIME HELPERS (shop local time)
========================= */
function localNow() {
    return new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3).toISOString().replace("T", " ").slice(0, 19);
}
function localToday() { return localNow().slice(0, 10); }
// ₦13,000 — used in activity-log notes
const money = n => "₦" + Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const niceDate = d => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MON[m - 1]} ${y}`; };   // 22 Oct 2026
const receiptNo = r => "No. " + parseInt(r.split("-").pop(), 10);                                       // R-20261022-0007 -> No. 7
function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function shiftDate(d, days) {
    const t = new Date(d + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
}

/* =========================
   PASSWORD HELPERS (scrypt, built into Node)
========================= */
function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}
function checkPassword(pw, stored) {
    if (!stored || !String(stored).startsWith("scrypt$")) return false;
    const [, salt, hash] = String(stored).split("$");
    const test = crypto.scryptSync(pw, salt, 64);
    const real = Buffer.from(hash, "hex");
    return real.length === test.length && crypto.timingSafeEqual(real, test);
}
const DEFAULT_PASSWORDS = ["admin123", "staff123"];

/* =========================
   QUERY HELPERS
   `ex` is the connection or an open transaction, so the same helpers work inside a sale.
========================= */
function toObjects(rs) {
    return rs.rows.map(r => {
        const o = {};
        rs.columns.forEach((c, i) => {
            const v = r[i];
            o[c] = typeof v === "bigint" ? Number(v) : v;
        });
        return o;
    });
}
// NaN/Infinity (e.g. from a bad id in the address) become NULL, so they simply match nothing
const clean = params => params.map(v => (typeof v === "number" && !Number.isFinite(v) ? null : v));
async function query(sql, params = [], ex = client) {
    return toObjects(await ex.execute({ sql, args: clean(params) }));
}
async function get(sql, params = [], ex = client) {
    return (await query(sql, params, ex))[0] || null;
}
async function run(sql, params = [], ex = client) {
    const rs = await ex.execute({ sql, args: clean(params) });
    return { lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null, changes: rs.rowsAffected };
}
async function columnExists(table, col) {
    return (await query(`PRAGMA table_info(${table})`)).some(c => c.name === col);
}

// Express 4 doesn't catch errors from async handlers — this does, so one bad request can't crash the server.
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* =========================
   SCHEMA
========================= */
const SCHEMA = `
    CREATE TABLE IF NOT EXISTS parts (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT    NOT NULL,
        sku     TEXT    NOT NULL UNIQUE,
        qty     INTEGER NOT NULL DEFAULT 0,
        min     INTEGER NOT NULL DEFAULT 5,
        price   REAL    NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT    NOT NULL UNIQUE,
        password TEXT    NOT NULL,
        role     TEXT    NOT NULL DEFAULT 'staff'
    );
    CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        username   TEXT    NOT NULL,
        action     TEXT    NOT NULL,
        part_id    INTEGER,
        part_name  TEXT,
        qty_before INTEGER,
        qty_after  INTEGER,
        qty_change INTEGER,
        note       TEXT,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        created_at TEXT    NOT NULL,
        expires_at TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no TEXT    NOT NULL UNIQUE,
        customer   TEXT,
        total      REAL    NOT NULL,
        total_cost REAL    NOT NULL DEFAULT 0,
        item_count INTEGER NOT NULL,
        user_id    INTEGER NOT NULL,
        username   TEXT    NOT NULL,
        sale_date  TEXT    NOT NULL,
        created_at TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id    INTEGER NOT NULL,
        part_id    INTEGER,
        part_name  TEXT    NOT NULL,
        sku        TEXT,
        qty        INTEGER NOT NULL,
        unit_price REAL    NOT NULL,
        unit_cost  REAL    NOT NULL DEFAULT 0,
        line_total REAL    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS day_close (
        close_date     TEXT PRIMARY KEY,
        cash_counted   REAL NOT NULL DEFAULT 0,
        pos_total      REAL NOT NULL DEFAULT 0,
        transfer_total REAL NOT NULL DEFAULT 0,
        note           TEXT,
        closed_by      TEXT NOT NULL,
        closed_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id);
`;
const DATA_TABLES = ["parts", "users", "audit_log", "sessions", "sales", "sale_items", "day_close", "settings"];

async function migrate() {
    await client.executeMultiple(SCHEMA);
    if (!(await columnExists("parts", "cost")))
        await run("ALTER TABLE parts ADD COLUMN cost REAL NOT NULL DEFAULT 0");
    if (!(await columnExists("parts", "barcode")))
        await run("ALTER TABLE parts ADD COLUMN barcode TEXT");
    if (!(await columnExists("sales", "payment_method")))
        await run("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
    if (!(await columnExists("users", "must_change_password")))
        await run("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");

    // Hash any passwords still stored as plain text. Default ones must be changed at next login.
    for (const u of await query("SELECT id, password FROM users")) {
        if (!String(u.password).startsWith("scrypt$")) {
            const mustChange = DEFAULT_PASSWORDS.includes(u.password) ? 1 : 0;
            await run("UPDATE users SET password = ?, must_change_password = ? WHERE id = ?",
                [hashPassword(String(u.password)), mustChange, u.id]);
            console.log(`🔐 Secured password for user #${u.id}`);
        }
    }
}

/* =========================
   BACKUP FILES (a normal SQLite file, whatever the storage)
========================= */
async function buildBackupFile() {
    const out = new SQL.Database();
    const tables = await query("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL");
    for (const t of tables) {
        out.run(t.sql);
        const rs = await client.execute(`SELECT * FROM "${t.name}"`);
        if (!rs.rows.length) continue;
        const cols = rs.columns.map(c => `"${c}"`).join(", ");
        const stmt = out.prepare(`INSERT INTO "${t.name}" (${cols}) VALUES (${rs.columns.map(() => "?").join(", ")})`);
        for (const r of rs.rows) stmt.run(rs.columns.map((_, i) => (typeof r[i] === "bigint" ? Number(r[i]) : r[i])));
        stmt.free();
    }
    for (const i of await query("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")) out.run(i.sql);
    const buf = Buffer.from(out.export());
    out.close();
    return buf;
}

// Daily copy, only when the data is a file on this machine/disk (Turso keeps its own history)
async function dailyBackup() {
    if (USING_TURSO) return;
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const file = path.join(BACKUP_DIR, `spareparts-${localToday()}.db`);
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, await buildBackupFile());
            console.log(`💾 Daily backup saved: ${path.basename(file)}`);
        }
        const old = fs.readdirSync(BACKUP_DIR).filter(f => /^spareparts-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        old.slice(0, Math.max(0, old.length - BACKUPS_KEPT)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    } catch (e) {
        console.error("Backup failed:", e.message);
    }
}

async function startServer() {
    SQL = await initSqlJs();

    if (USING_TURSO) {
        client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
        console.log("📦 Using Turso online database");
    } else {
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        client = createClient({ url: "file:" + DB_PATH });
        console.log(`📦 Using database file ${DB_PATH}`);
        if (!STORAGE_PERMANENT)
            console.warn("⚠️  No Turso settings — on Render, all data will be LOST at the next restart. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
    }

    await migrate();

    if ((await get("SELECT COUNT(*) AS c FROM users")).c === 0) {
        await run("INSERT INTO users (username, password, role, must_change_password) VALUES (?, ?, 'admin', 1)",
            ["admin", hashPassword("admin123")]);
        console.log("✅ First admin created: admin / admin123 (must be changed on first login)");
    }
    if ((await get("SELECT COUNT(*) AS c FROM parts")).c === 0) {
        await client.batch([
            "INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Brake Pad','BP-001',10,3,5000,3500)",
            "INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Oil Filter','OF-002',2,5,3000,2000)",
            "INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Spark Plug','SP-003',0,5,1500,900)"
        ], "write");
    }
    await run("DELETE FROM sessions WHERE expires_at < ?", [localNow()]);
    await dailyBackup();
    setInterval(dailyBackup, 60 * 60 * 1000);

    /* =========================
       AUTH
    ========================= */
    function publicUser(u) {
        return { id: u.id, username: u.username, role: u.role, must_change_password: !!u.must_change_password };
    }

    async function loadSession(req) {
        const hdr = req.headers.authorization || "";
        const token = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
        if (!token) return null;
        const row = await get(`SELECT u.*, s.token, s.expires_at FROM sessions s
                               JOIN users u ON u.id = s.user_id WHERE s.token = ?`, [token]);
        if (!row) return null;
        if (row.expires_at < localNow()) { await run("DELETE FROM sessions WHERE token = ?", [token]); return null; }
        return row;
    }

    // allowWhilePending lets a user who still has a starter password reach "change password"
    const authCheck = (allowWhilePending, adminOnly) => h(async (req, res, next) => {
        const user = await loadSession(req);
        if (!user) return res.status(401).json({ message: "Please sign in again", code: "NO_SESSION" });
        if (user.must_change_password && !allowWhilePending)
            return res.status(403).json({ message: "Change your password to continue", code: "MUST_CHANGE_PASSWORD" });
        if (adminOnly && user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
        req.user = user;
        next();
    });
    const requireAuth    = authCheck(false, false);
    const requireAdmin   = authCheck(false, true);
    const requireSession = authCheck(true, false);

    // Simple brute-force protection: 5 wrong tries locks that username for 10 minutes
    const failedLogins = new Map();
    function isLocked(key) {
        const f = failedLogins.get(key);
        return f && f.count >= 5 && Date.now() - f.last < 10 * 60e3;
    }
    function recordFail(key) {
        const f = failedLogins.get(key) || { count: 0, last: 0 };
        if (Date.now() - f.last > 10 * 60e3) f.count = 0;
        f.count++; f.last = Date.now();
        failedLogins.set(key, f);
    }

    /* =========================
       AUDIT
    ========================= */
    async function writeAudit({ user, action, part, qtyBefore, qtyAfter, note }, ex = client) {
        await run(
            `INSERT INTO audit_log (user_id, username, action, part_id, part_name, qty_before, qty_after, qty_change, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.id, user.username, action,
                part?.id ?? null, part?.name ?? null,
                qtyBefore ?? null, qtyAfter ?? null,
                (qtyAfter != null && qtyBefore != null) ? qtyAfter - qtyBefore : null,
                note ?? null, localNow()
            ], ex);
    }

    const toInt = v => (v !== "" && v != null && Number.isInteger(Number(v)) ? Number(v) : NaN);
    const toNum = v => (v === "" || v == null ? NaN : Number(v));

    // Barcodes: letters/numbers/dot/dash/underscore, up to 48 chars. Empty means "none".
    function cleanBarcode(v) {
        const b = String(v ?? "").trim();
        if (!b) return { value: null };
        if (!/^[A-Za-z0-9._\-]{3,48}$/.test(b)) return { error: "Barcode can only contain letters, numbers, dot, dash or underscore" };
        return { value: b };
    }
    // Every part also answers to a printable shop code: an EAN-13 in the 20-29 range,
    // which GS1 reserves for a shop's own in-store items, so it never clashes with a real product.
    function shopCode(id) {
        const body = "200" + String(id).padStart(9, "0");
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 ? 3 : 1);
        return body + ((10 - (sum % 10)) % 10);
    }
    async function barcodeTaken(code, exceptId = 0) {
        if (!code) return false;
        const m = /^200(\d{9})\d$/.exec(code);
        if (m && Number(m[1]) !== exceptId) return true;
        return !!(await get("SELECT id FROM parts WHERE (LOWER(barcode) = LOWER(?) OR LOWER(sku) = LOWER(?)) AND id != ?",
                            [code, code, exceptId]));
    }
    const PART_COLS_STAFF = "id, name, sku, barcode, qty, min, price";
    const partFor = (user, id) => get(`SELECT ${user.role === "admin" ? "*" : PART_COLS_STAFF} FROM parts WHERE id = ?`, [id]);

    /* =========================
       USERS / LOGIN
    ========================= */
    app.post("/api/users/login", h(async (req, res) => {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");
        const key = username.toLowerCase();

        if (isLocked(key))
            return res.status(429).json({ message: "Too many wrong attempts. Try again in 10 minutes." });

        const user = await get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [username]);
        if (!user || !checkPassword(password, user.password)) {
            recordFail(key);
            return res.status(401).json({ message: "Invalid login details" });
        }
        failedLogins.delete(key);

        const token   = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3 + SESSION_DAYS * 86400e3)
                            .toISOString().replace("T", " ").slice(0, 19);
        await run("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            [token, user.id, localNow(), expires]);
        res.json({ token, user: publicUser(user) });
    }));

    app.get("/api/users/me", requireSession, (req, res) => res.json(publicUser(req.user)));

    app.post("/api/users/logout", h(async (req, res) => {
        const user = await loadSession(req);
        if (user) await run("DELETE FROM sessions WHERE token = ?", [user.token]);
        res.json({ message: "Signed out" });
    }));

    app.post("/api/users/change-password", requireSession, h(async (req, res) => {
        const current = String(req.body?.current || "");
        const fresh   = String(req.body?.new || "");
        if (!checkPassword(current, req.user.password))
            return res.status(400).json({ message: "Current password is wrong" });
        if (fresh.length < 6)
            return res.status(400).json({ message: "New password must be at least 6 characters" });
        if (DEFAULT_PASSWORDS.includes(fresh) || fresh === current)
            return res.status(400).json({ message: "Choose a new password you haven't used here" });

        await run("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?", [hashPassword(fresh), req.user.id]);
        await run("DELETE FROM sessions WHERE user_id = ? AND token != ?", [req.user.id, req.user.token]);   // sign out other devices
        await writeAudit({ user: req.user, action: "CHANGE_PASSWORD", note: "Password changed" });
        res.json({ message: "Password changed" });
    }));

    app.get("/api/users", requireAdmin, h(async (req, res) => {
        res.json(await query("SELECT id, username, role FROM users ORDER BY role, username"));
    }));

    app.post("/api/users", requireAdmin, h(async (req, res) => {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");
        const role     = req.body?.role === "admin" ? "admin" : "staff";

        if (!/^[A-Za-z0-9._-]{3,30}$/.test(username))
            return res.status(400).json({ message: "Username: 3–30 letters, numbers, dot, dash or underscore" });
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (await get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [username]))
            return res.status(400).json({ message: "Username already taken" });

        // New staff choose their own password on first sign-in
        const r = await run("INSERT INTO users (username, password, role, must_change_password) VALUES (?, ?, ?, 1)",
            [username, hashPassword(password), role]);
        await writeAudit({ user: req.user, action: "ADD_USER", note: `Added ${username} as ${role === "admin" ? "owner" : "staff"}` });
        res.status(201).json({ id: r.lastInsertRowid, username, role });
    }));

    app.delete("/api/users/:id", requireAdmin, h(async (req, res) => {
        const id = toInt(req.params.id);
        if (id === req.user.id) return res.status(400).json({ message: "You can't remove yourself" });
        const user = await get("SELECT * FROM users WHERE id = ?", [id]);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.role === "admin" && (await get("SELECT COUNT(*) AS c FROM users WHERE role='admin'")).c <= 1)
            return res.status(400).json({ message: "Keep at least one admin" });
        await client.batch([
            { sql: "DELETE FROM sessions WHERE user_id = ?", args: [id] },
            { sql: "DELETE FROM users WHERE id = ?", args: [id] }
        ], "write");
        await writeAudit({ user: req.user, action: "DELETE_USER", note: `Removed ${user.username}` });
        res.json({ message: "Removed" });
    }));

    /* =========================
       PARTS
    ========================= */
    app.get("/api/parts", requireAuth, h(async (req, res) => {
        const cols = req.user.role === "admin" ? "*" : PART_COLS_STAFF;
        res.json(await query(`SELECT ${cols} FROM parts ORDER BY name ASC`));
    }));

    app.post("/api/parts", requireAdmin, h(async (req, res) => {
        const name  = String(req.body?.name || "").trim();
        const sku   = String(req.body?.sku || "").trim();
        const qty   = toInt(req.body?.qty ?? 0);
        const min   = toInt(req.body?.min ?? 5);
        const price = toNum(req.body?.price ?? 0);
        const cost  = toNum(req.body?.cost ?? 0);
        const bc    = cleanBarcode(req.body?.barcode);

        if (!name || !sku) return res.status(400).json({ message: "Name and SKU required" });
        if (bc.error) return res.status(400).json({ message: bc.error });
        if (await barcodeTaken(bc.value)) return res.status(400).json({ message: "That barcode is already on another part" });
        if (!(qty >= 0) || !(min >= 0) || !(price >= 0) || !(cost >= 0))
            return res.status(400).json({ message: "Quantity, minimum, price and cost must be 0 or more" });
        if (await get("SELECT id FROM parts WHERE LOWER(sku) = LOWER(?)", [sku]))
            return res.status(400).json({ message: "SKU already exists" });

        const r = await run("INSERT INTO parts (name, sku, barcode, qty, min, price, cost) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [name, sku, bc.value, qty, min, price, cost]);
        const part = await get("SELECT * FROM parts WHERE id = ?", [r.lastInsertRowid]);
        await writeAudit({ user: req.user, action: "ADD_PART", part, qtyBefore: 0, qtyAfter: qty, note: `Selling price ${money(price)}` });
        res.status(201).json(part);
    }));

    // Admin: edit details. Only these named fields are read — nothing else in the request is used.
    app.put("/api/parts/:id", requireAdmin, h(async (req, res) => {
        const id   = toInt(req.params.id);
        const part = await get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });

        const b = req.body || {};
        const upd = {
            name:    b.name  !== undefined ? String(b.name).trim() : part.name,
            sku:     b.sku   !== undefined ? String(b.sku).trim()  : part.sku,
            min:     b.min   !== undefined ? toInt(b.min)          : part.min,
            price:   b.price !== undefined ? toNum(b.price)        : part.price,
            cost:    b.cost  !== undefined ? toNum(b.cost)         : part.cost,
            barcode: part.barcode ?? null,
        };
        if (b.barcode !== undefined) {
            const bc = cleanBarcode(b.barcode);
            if (bc.error) return res.status(400).json({ message: bc.error });
            if (await barcodeTaken(bc.value, id)) return res.status(400).json({ message: "That barcode is already on another part" });
            upd.barcode = bc.value;
        }
        if (!upd.name || !upd.sku) return res.status(400).json({ message: "Name and SKU required" });
        if (!(upd.min >= 0) || !(upd.price >= 0) || !(upd.cost >= 0))
            return res.status(400).json({ message: "Minimum, price and cost must be 0 or more" });
        if (await get("SELECT id FROM parts WHERE LOWER(sku) = LOWER(?) AND id != ?", [upd.sku, id]))
            return res.status(400).json({ message: "SKU already used by another part" });

        await run("UPDATE parts SET name=?, sku=?, min=?, price=?, cost=?, barcode=? WHERE id=?",
            [upd.name, upd.sku, upd.min, upd.price, upd.cost, upd.barcode, id]);
        const NAMES = { name: "Name", sku: "SKU", min: "Warn-at level", price: "Price", cost: "Cost", barcode: "Barcode" };
        const show = (k, v) => (k === "price" || k === "cost") ? money(v) : (v == null || v === "" ? "none" : v);
        const changes = Object.keys(upd).filter(k => (upd[k] ?? null) !== (part[k] ?? null))
            .map(k => `${NAMES[k]}: ${show(k, part[k])} → ${show(k, upd[k])}`).join("; ");
        await writeAudit({ user: req.user, action: "EDIT_PART", part, note: changes || "No changes" });
        res.json(await get("SELECT * FROM parts WHERE id = ?", [id]));
    }));

    // Anyone signed in can restock (add stock). Only admins can correct stock down.
    app.post("/api/parts/:id/restock", requireAuth, h(async (req, res) => {
        const id   = toInt(req.params.id);
        const add  = toInt(req.body?.qty);
        const part = await get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        if (!(add > 0) || add > 100000) return res.status(400).json({ message: "Enter a valid quantity" });

        await run("UPDATE parts SET qty = qty + ? WHERE id = ?", [add, id]);
        await writeAudit({ user: req.user, action: "RESTOCK", part, qtyBefore: part.qty, qtyAfter: part.qty + add,
                           note: `Added ${add} to stock` });
        res.json(await partFor(req.user, id));
    }));

    app.post("/api/parts/:id/adjust", requireAdmin, h(async (req, res) => {
        const id     = toInt(req.params.id);
        const newQty = toInt(req.body?.qty);
        const reason = String(req.body?.reason || "").trim();
        const part   = await get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        if (!(newQty >= 0)) return res.status(400).json({ message: "Enter a valid quantity" });
        if (!reason) return res.status(400).json({ message: "Give a reason (e.g. stock count, damaged)" });

        await run("UPDATE parts SET qty = ? WHERE id = ?", [newQty, id]);
        await writeAudit({ user: req.user, action: "ADJUST", part, qtyBefore: part.qty, qtyAfter: newQty, note: reason });
        res.json(await get("SELECT * FROM parts WHERE id = ?", [id]));
    }));

    app.delete("/api/parts/:id", requireAdmin, h(async (req, res) => {
        const id   = toInt(req.params.id);
        const part = await get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        await run("DELETE FROM parts WHERE id = ?", [id]);
        await writeAudit({ user: req.user, action: "DELETE_PART", part, qtyBefore: part.qty, qtyAfter: 0, note: "Removed from inventory" });
        res.json({ message: "Deleted" });
    }));

    /* =========================
       SALES & RECEIPTS
    ========================= */
    async function saleWithItems(id, isAdmin) {
        const sale = await get("SELECT * FROM sales WHERE id = ?", [id]);
        if (!sale) return null;
        sale.items = await query("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id", [id]);
        if (!isAdmin) {
            delete sale.total_cost;
            sale.items.forEach(i => delete i.unit_cost);
        }
        return sale;
    }

    app.post("/api/sales", requireAuth, h(async (req, res) => {
        const items    = Array.isArray(req.body?.items) ? req.body.items : [];
        const customer = String(req.body?.customer || "").trim().slice(0, 80) || null;
        const method   = ["cash", "pos", "transfer"].includes(req.body?.payment_method) ? req.body.payment_method : null;
        if (!method) return res.status(400).json({ message: "Choose how the customer paid" });
        if (!items.length) return res.status(400).json({ message: "Add at least one item" });
        if (items.length > 50) return res.status(400).json({ message: "Too many lines on one sale" });

        const wanted = new Map();
        for (const it of items) {
            const pid = toInt(it?.part_id), q = toInt(it?.qty);
            if (!(pid > 0) || !(q > 0)) return res.status(400).json({ message: "Each item needs a part and a quantity" });
            wanted.set(pid, (wanted.get(pid) || 0) + q);
        }

        // Everything below happens in one transaction: either the whole sale is saved, or nothing is.
        const tx = await client.transaction("write");
        try {
            const lines = [];
            for (const [pid, q] of wanted) {
                const part = await get("SELECT * FROM parts WHERE id = ?", [pid], tx);
                if (!part) { await tx.rollback(); return res.status(400).json({ message: "A part on this sale no longer exists" }); }
                if (part.qty < q) { await tx.rollback(); return res.status(400).json({ message: `Only ${part.qty} ${part.name} in stock` }); }
                lines.push({ part, qty: q });
            }

            const now   = localNow();
            const date  = now.slice(0, 10);
            const total = lines.reduce((s, l) => s + l.qty * l.part.price, 0);
            const cost  = lines.reduce((s, l) => s + l.qty * (l.part.cost || 0), 0);
            const count = lines.reduce((s, l) => s + l.qty, 0);

            const prefix = `R-${date.replace(/-/g, "")}-`;
            const last = await get("SELECT receipt_no FROM sales WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1", [prefix + "%"], tx);
            const receipt = prefix + String(last ? parseInt(last.receipt_no.slice(prefix.length), 10) + 1 : 1).padStart(4, "0");

            const { lastInsertRowid: saleId } = await run(
                `INSERT INTO sales (receipt_no, customer, total, total_cost, item_count, user_id, username, sale_date, created_at, payment_method)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [receipt, customer, total, cost, count, req.user.id, req.user.username, date, now, method], tx);

            for (const { part, qty } of lines) {
                await run(`INSERT INTO sale_items (sale_id, part_id, part_name, sku, qty, unit_price, unit_cost, line_total)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [saleId, part.id, part.name, part.sku, qty, part.price, part.cost || 0, qty * part.price], tx);
                await run("UPDATE parts SET qty = qty - ? WHERE id = ?", [qty, part.id], tx);
                await writeAudit({ user: req.user, action: "SALE", part, qtyBefore: part.qty, qtyAfter: part.qty - qty,
                                   note: `Sold ${qty} × ${money(part.price)} · receipt ${receiptNo(receipt)}` }, tx);
            }
            await tx.commit();
            res.status(201).json(await saleWithItems(saleId, req.user.role === "admin"));
        } catch (e) {
            try { await tx.rollback(); } catch (_) {}
            console.error("Sale failed:", e.message);
            res.status(500).json({ message: "Sale could not be saved. Nothing was deducted." });
        } finally {
            try { tx.close(); } catch (_) {}
        }
    }));

    // List sales for a day. Staff see only their own sales.
    app.get("/api/sales", requireAuth, h(async (req, res) => {
        const date = isDate(req.query.date) ? req.query.date : localToday();
        const isAdmin = req.user.role === "admin";
        const rows = isAdmin
            ? await query("SELECT * FROM sales WHERE sale_date = ? ORDER BY id DESC", [date])
            : await query("SELECT * FROM sales WHERE sale_date = ? AND user_id = ? ORDER BY id DESC", [date, req.user.id]);
        if (!isAdmin) rows.forEach(r => delete r.total_cost);
        res.json({ date, sales: rows });
    }));

    app.get("/api/sales/:id", requireAuth, h(async (req, res) => {
        const isAdmin = req.user.role === "admin";
        const sale = await saleWithItems(toInt(req.params.id), isAdmin);
        if (!sale || (!isAdmin && sale.user_id !== req.user.id))
            return res.status(404).json({ message: "Receipt not found" });
        res.json(sale);
    }));

    /* =========================
       REPORTS (admin)
    ========================= */
    app.get("/api/reports/daily", requireAdmin, h(async (req, res) => {
        const date = isDate(req.query.date) ? req.query.date : localToday();
        const sum  = await get(`SELECT COUNT(*) AS sales, COALESCE(SUM(total),0) AS revenue,
                                       COALESCE(SUM(total_cost),0) AS cost, COALESCE(SUM(item_count),0) AS items
                                FROM sales WHERE sale_date = ?`, [date]);
        const topParts = await query(`SELECT i.part_name, i.sku, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
                                      FROM sale_items i JOIN sales s ON s.id = i.sale_id
                                      WHERE s.sale_date = ? GROUP BY i.part_id, i.part_name
                                      ORDER BY revenue DESC LIMIT 10`, [date]);
        const byStaff = await query(`SELECT username, COUNT(*) AS sales, SUM(total) AS revenue
                                     FROM sales WHERE sale_date = ? GROUP BY user_id, username
                                     ORDER BY revenue DESC`, [date]);

        const rows = await query(`SELECT sale_date, SUM(total) AS revenue FROM sales
                                  WHERE sale_date BETWEEN ? AND ? GROUP BY sale_date`, [shiftDate(date, -6), date]);
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
            const d = shiftDate(date, -i);
            last7.push({ date: d, revenue: rows.find(r => r.sale_date === d)?.revenue || 0 });
        }

        const missingCost = (await get(`SELECT COUNT(*) AS c FROM sale_items i JOIN sales s ON s.id = i.sale_id
                                        WHERE s.sale_date = ? AND i.unit_cost = 0`, [date])).c;
        // Profit only counts lines where a cost price was recorded, so a missing cost never inflates it
        const profit = (await get(`SELECT COALESCE(SUM(i.line_total - i.qty * i.unit_cost), 0) AS p
                                   FROM sale_items i JOIN sales s ON s.id = i.sale_id
                                   WHERE s.sale_date = ? AND i.unit_cost > 0`, [date])).p;

        const byMethod = { cash: 0, pos: 0, transfer: 0 };
        for (const r of await query("SELECT payment_method AS m, SUM(total) AS t FROM sales WHERE sale_date = ? GROUP BY payment_method", [date]))
            byMethod[r.m] = r.t;
        const close = await get("SELECT * FROM day_close WHERE close_date = ?", [date]);

        res.json({
            date, by_method: byMethod, close,
            sales: sum.sales, items: sum.items,
            revenue: sum.revenue, cost: sum.cost, profit,
            missing_cost_lines: missingCost,
            top_parts: topParts, by_staff: byStaff, last7
        });
    }));

    // End-of-day check: owner records what was actually counted / received
    app.post("/api/reports/close", requireAdmin, h(async (req, res) => {
        const date = isDate(req.body?.date) ? req.body.date : null;
        const cash = toNum(req.body?.cash), pos = toNum(req.body?.pos), transfer = toNum(req.body?.transfer);
        const note = String(req.body?.note || "").trim().slice(0, 300) || null;
        if (!date) return res.status(400).json({ message: "Pick a date" });
        if (date > localToday()) return res.status(400).json({ message: "You can't close a day that hasn't happened" });
        if (!(cash >= 0) || !(pos >= 0) || !(transfer >= 0))
            return res.status(400).json({ message: "Enter amounts of 0 or more" });

        const before = await get("SELECT * FROM day_close WHERE close_date = ?", [date]);
        await run(`INSERT INTO day_close (close_date, cash_counted, pos_total, transfer_total, note, closed_by, closed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(close_date) DO UPDATE SET cash_counted=excluded.cash_counted, pos_total=excluded.pos_total,
                       transfer_total=excluded.transfer_total, note=excluded.note, closed_by=excluded.closed_by, closed_at=excluded.closed_at`,
            [date, cash, pos, transfer, note, req.user.username, localNow()]);
        await writeAudit({ user: req.user, action: "DAY_CLOSE",
                           note: `${before ? "Updated" : "Saved"} for ${niceDate(date)}: cash ${money(cash)}, POS ${money(pos)}, transfer ${money(transfer)}` });
        res.json(await get("SELECT * FROM day_close WHERE close_date = ?", [date]));
    }));

    /* =========================
       SHOP DETAILS (shown on receipts)
    ========================= */
    const SHOP_KEYS = { name: 60, address: 120, phone: 40, receipt_note: 120 };
    async function readShop() {
        const out = { name: "", address: "", phone: "", receipt_note: "" };
        for (const r of await query("SELECT key, value FROM settings WHERE key LIKE 'shop_%'"))
            out[r.key.slice(5)] = r.value || "";
        return out;
    }
    // Before sign-in: only the name, for the sign-in screen
    app.get("/api/settings/public", h(async (req, res) => res.json({ name: (await readShop()).name })));
    app.get("/api/settings", requireAuth, h(async (req, res) => res.json(await readShop())));
    app.put("/api/settings", requireAdmin, h(async (req, res) => {
        const stmts = [];
        for (const [k, max] of Object.entries(SHOP_KEYS)) {
            if (req.body?.[k] === undefined) continue;
            const v = String(req.body[k]).trim().slice(0, max);
            stmts.push({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: ["shop_" + k, v] });
        }
        if (stmts.length) await client.batch(stmts, "write");
        const shop = await readShop();
        await writeAudit({ user: req.user, action: "SHOP_DETAILS", note: `Shop name: ${shop.name || "—"}` });
        res.json(shop);
    }));

    /* =========================
       AUDIT LOG
    ========================= */
    app.get("/api/audit", requireAdmin, h(async (req, res) => {
        const limit  = Math.min(toInt(req.query.limit) || 100, 500);
        const offset = Math.max(toInt(req.query.offset) || 0, 0);
        const logs   = await query("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
        const total  = (await get("SELECT COUNT(*) AS c FROM audit_log")).c;
        res.json({ logs, total });
    }));

    app.get("/api/health", (req, res) => res.json({
        ok: true, time: localNow(), storage_permanent: STORAGE_PERMANENT, storage: USING_TURSO ? "turso" : "file"
    }));

    /* =========================
       BACKUPS (admin)
    ========================= */
    app.get("/api/admin/backup", requireAdmin, h(async (req, res) => {
        await writeAudit({ user: req.user, action: "BACKUP", note: "Downloaded a full backup" });
        const buf = await buildBackupFile();
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="spareparts-backup-${localNow().replace(/[: ]/g, "-")}.db"`);
        res.send(buf);
    }));

    // Replace ALL data with a backup file (e.g. moving from one server to another).
    app.post("/api/admin/restore", express.raw({ type: "application/octet-stream", limit: "50mb" }), requireAdmin, h(async (req, res) => {
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.subarray(0, 15).toString() !== "SQLite format 3")
            return res.status(400).json({ message: "That isn't a SpareParts backup file" });

        let src;
        try {
            src = new SQL.Database(buf);
            const tables = src.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.flat() || [];
            if (!tables.includes("parts") || !tables.includes("users")) throw new Error("missing tables");
            if (!src.exec("SELECT COUNT(*) FROM users WHERE role='admin'")[0].values[0][0]) throw new Error("no admin");

            // Keep a safety copy of the current data when it's a file
            if (!USING_TURSO) {
                fs.mkdirSync(BACKUP_DIR, { recursive: true });
                fs.writeFileSync(path.join(BACKUP_DIR, `before-restore-${localNow().replace(/[: ]/g, "-")}.db`), await buildBackupFile());
            }

            // Copy each table's rows, using only columns both sides have (older backups get today's defaults)
            const stmts = [];
            for (const t of DATA_TABLES) {
                stmts.push(`DELETE FROM ${t}`);
                if (!tables.includes(t)) continue;
                const here = (await query(`PRAGMA table_info(${t})`)).map(c => c.name);
                const res2 = src.exec(`SELECT * FROM "${t}"`)[0];
                if (!res2) continue;
                const idx = res2.columns.map((c, i) => [c, i]).filter(([c]) => here.includes(c));
                const cols = idx.map(([c]) => `"${c}"`).join(", ");
                const qs = idx.map(() => "?").join(", ");
                for (const row of res2.values) stmts.push({ sql: `INSERT INTO ${t} (${cols}) VALUES (${qs})`, args: idx.map(([, i]) => row[i]) });
            }
            await client.batch(stmts, "write");   // all or nothing
        } catch (e) {
            console.error("Restore failed:", e.message);
            return res.status(400).json({ message: "That file isn't a usable SpareParts backup" });
        } finally {
            try { src?.close(); } catch (_) {}
        }
        await migrate();   // hashes any old plain passwords in the restored data
        res.json({ message: "Backup restored. Sign in again with the passwords from that backup." });
    }));

    app.get("/api/admin/storage", requireAdmin, h(async (req, res) => {
        let backups = [];
        if (!USING_TURSO) {
            try { backups = fs.readdirSync(BACKUP_DIR).filter(f => /^spareparts-.*\.db$/.test(f)).sort().reverse(); } catch (_) {}
        }
        res.json({ permanent: STORAGE_PERMANENT, storage: USING_TURSO ? "turso" : "file",
                   latest_backup: backups[0] || null, backups_kept: backups.length });
    }));

    app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

    // Serve the app screens from the same server
    const FRONTEND = path.join(__dirname, "..", "frontend");
    if (fs.existsSync(FRONTEND)) app.use(express.static(FRONTEND));

    // Any unexpected error: log it, answer cleanly, keep running
    app.use((err, req, res, next) => {
        console.error("Error:", err.message);
        if (res.headersSent) return next(err);
        res.status(500).json({ message: "Something went wrong on the server. Please try again." });
    });

    app.listen(PORT, () => console.log(`✅ SpareParts server running on http://localhost:${PORT}`));
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
