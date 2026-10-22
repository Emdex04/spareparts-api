const express   = require("express");
const cors      = require("cors");
const path      = require("path");
const fs        = require("fs");
const crypto    = require("crypto");
const initSqlJs = require("sql.js");

const app  = express();
const PORT = process.env.PORT || 5000;              // Render sets PORT itself
const TZ_OFFSET_HOURS = Number(process.env.TZ_OFFSET_HOURS ?? 1); // Lagos = UTC+1
const SESSION_DAYS    = 7;

app.use(cors());
app.use(express.json({ limit: "200kb" }));

/* =========================
   DATABASE SETUP
========================= */
// On a host, DB_PATH must point at a permanent disk (e.g. /var/data/spareparts.db on Render).
const LOCAL_DB   = path.join(__dirname, "spareparts.db");
const DB_PATH    = process.env.DB_PATH || LOCAL_DB;
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");
const BACKUPS_KEPT = 30;   // one per day
// On Render, the app's own folder is wiped on every restart. Data is only safe when DB_PATH is set to the disk.
const STORAGE_PERMANENT = !process.env.RENDER || !!process.env.DB_PATH;
let db;
let dirty = false;

// Write to a temp file, then swap it in, so a crash mid-save can never leave a half-written database.
function saveDb() {
    if (!db) return;
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, DB_PATH);
    dirty = false;
}

// Daily copy kept beside the database: backups/spareparts-2026-10-22.db (last 30 days)
function dailyBackup() {
    try {
        if (!fs.existsSync(DB_PATH)) return;
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const file = path.join(BACKUP_DIR, `spareparts-${localToday()}.db`);
        if (!fs.existsSync(file)) {
            fs.copyFileSync(DB_PATH, file);
            console.log(`💾 Daily backup saved: ${path.basename(file)}`);
        }
        const old = fs.readdirSync(BACKUP_DIR).filter(f => /^spareparts-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
        old.slice(0, Math.max(0, old.length - BACKUPS_KEPT)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    } catch (e) {
        console.error("Backup failed:", e.message);
    }
}

setInterval(() => { if (dirty) saveDb(); }, 30000);
setInterval(dailyBackup, 60 * 60 * 1000);   // checks hourly, writes once per day
process.on("exit",    () => { try { saveDb(); } catch (_) {} });
process.on("SIGINT",  () => { try { saveDb(); } catch (_) {} process.exit(); });
process.on("SIGTERM", () => { try { saveDb(); } catch (_) {} process.exit(); });

/* =========================
   TIME HELPERS (shop local time)
========================= */
function localNow() {
    // "YYYY-MM-DD HH:MM:SS" in shop time
    return new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3).toISOString().replace("T", " ").slice(0, 19);
}
function localToday() { return localNow().slice(0, 10); }
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

async function startServer() {
    const SQL = await initSqlJs();

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    // First start on a new disk: bring across the database that shipped with the app (your existing data)
    if (!fs.existsSync(DB_PATH) && DB_PATH !== LOCAL_DB && fs.existsSync(LOCAL_DB)) {
        fs.copyFileSync(LOCAL_DB, DB_PATH);
        console.log(`📦 Copied existing data to ${DB_PATH}`);
    }
    if (!STORAGE_PERMANENT)
        console.warn("⚠️  DB_PATH is not set — on Render, all data will be LOST at the next restart. Add a disk and set DB_PATH.");

    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
        console.log("📦 Loaded existing database");
    } else {
        db = new SQL.Database();
        console.log("📦 Created new database");
    }

    db.run(`
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
            created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
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
        CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
        CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id);
    `);

    /* ---------- query helpers ---------- */
    function query(sql, params = []) {
        const stmt = db.prepare(sql);
        const out  = [];
        stmt.bind(params);
        while (stmt.step()) out.push(stmt.getAsObject());
        stmt.free();
        return out;
    }
    function get(sql, params = []) { return query(sql, params)[0] || null; }
    function run(sql, params = [], save = true) {
        db.run(sql, params);
        const { id } = get("SELECT last_insert_rowid() AS id");
        if (save) saveDb();
        return { lastInsertRowid: id };
    }
    function columnExists(table, col) {
        return query(`PRAGMA table_info(${table})`).some(c => c.name === col);
    }

    /* ---------- migrations for older databases ---------- */
    if (!columnExists("parts", "cost"))
        db.run("ALTER TABLE parts ADD COLUMN cost REAL NOT NULL DEFAULT 0");
    if (!columnExists("parts", "barcode"))
        db.run("ALTER TABLE parts ADD COLUMN barcode TEXT");
    if (!columnExists("sales", "payment_method"))
        db.run("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
    db.run(`CREATE TABLE IF NOT EXISTS day_close (
                close_date     TEXT PRIMARY KEY,
                cash_counted   REAL NOT NULL DEFAULT 0,
                pos_total      REAL NOT NULL DEFAULT 0,
                transfer_total REAL NOT NULL DEFAULT 0,
                note           TEXT,
                closed_by      TEXT NOT NULL,
                closed_at      TEXT NOT NULL
            )`);
    if (!columnExists("users", "must_change_password"))
        db.run("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");

    // Hash any passwords still stored as plain text. Default ones must be changed at next login.
    for (const u of query("SELECT id, password FROM users")) {
        if (!String(u.password).startsWith("scrypt$")) {
            const mustChange = DEFAULT_PASSWORDS.includes(u.password) ? 1 : 0;
            db.run("UPDATE users SET password = ?, must_change_password = ? WHERE id = ?",
                [hashPassword(String(u.password)), mustChange, u.id]);
            console.log(`🔐 Secured password for user #${u.id}`);
        }
    }

    // Seed first admin on a brand-new database
    if (get("SELECT COUNT(*) AS c FROM users").c === 0) {
        db.run("INSERT INTO users (username, password, role, must_change_password) VALUES (?, ?, 'admin', 1)",
            ["admin", hashPassword("admin123")]);
        console.log("✅ First admin created: admin / admin123 (must be changed on first login)");
    }
    if (get("SELECT COUNT(*) AS c FROM parts").c === 0) {
        db.run("INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Brake Pad','BP-001',10,3,5000,3500)");
        db.run("INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Oil Filter','OF-002',2,5,3000,2000)");
        db.run("INSERT INTO parts (name, sku, qty, min, price, cost) VALUES ('Spark Plug','SP-003',0,5,1500,900)");
    }
    db.run("DELETE FROM sessions WHERE expires_at < ?", [localNow()]);
    saveDb();
    dailyBackup();

    /* =========================
       AUTH
    ========================= */
    function publicUser(u) {
        return { id: u.id, username: u.username, role: u.role, must_change_password: !!u.must_change_password };
    }

    function loadSession(req) {
        const h = req.headers.authorization || "";
        const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
        if (!token) return null;
        const row = get(`SELECT u.*, s.token, s.expires_at FROM sessions s
                         JOIN users u ON u.id = s.user_id WHERE s.token = ?`, [token]);
        if (!row) return null;
        if (row.expires_at < localNow()) { run("DELETE FROM sessions WHERE token = ?", [token]); return null; }
        return row;
    }

    // allowWhilePending: lets a user with a default password reach the change-password route
    function requireAuth(req, res, next, allowWhilePending = false) {
        const user = loadSession(req);
        if (!user) return res.status(401).json({ message: "Please sign in again", code: "NO_SESSION" });
        if (user.must_change_password && !allowWhilePending)
            return res.status(403).json({ message: "Change your password to continue", code: "MUST_CHANGE_PASSWORD" });
        req.user = user;
        next();
    }
    function requireAdmin(req, res, next) {
        requireAuth(req, res, () => {
            if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
            next();
        });
    }

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
    function writeAudit({ user, action, part, qtyBefore, qtyAfter, note }, save = true) {
        db.run(
            `INSERT INTO audit_log (user_id, username, action, part_id, part_name, qty_before, qty_after, qty_change, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.id, user.username, action,
                part?.id ?? null, part?.name ?? null,
                qtyBefore ?? null, qtyAfter ?? null,
                (qtyAfter != null && qtyBefore != null) ? qtyAfter - qtyBefore : null,
                note ?? null, localNow()
            ]
        );
        if (save) saveDb();
    }

    const toInt = v => (v !== "" && v != null && Number.isInteger(Number(v)) ? Number(v) : NaN);
    const toNum = v => (v === "" || v == null ? NaN : Number(v));

    // Barcodes: digits/letters/dashes only, up to 48 chars. Empty means "none".
    function cleanBarcode(v) {
        const b = String(v ?? "").trim();
        if (!b) return { value: null };
        if (!/^[A-Za-z0-9._\-]{3,48}$/.test(b)) return { error: "Barcode can only contain letters, numbers, dot, dash or underscore" };
        return { value: b };
    }
    // Every part also answers to a printable shop code: an EAN-13 in the 20-29 range,
    // which GS1 reserves for a shop's own in-store items, so it never clashes with a real product.
    // Part 12 -> 200000000012 + check digit.
    function shopCode(id) {
        const body = "200" + String(id).padStart(9, "0");
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 ? 3 : 1);
        return body + ((10 - (sum % 10)) % 10);
    }
    function barcodeTaken(code, exceptId = 0) {
        if (!code) return false;
        const m = /^200(\d{9})\d$/.exec(code);
        if (m && Number(m[1]) !== exceptId) return true;   // would clash with another part's shop code
        return !!get("SELECT id FROM parts WHERE (LOWER(barcode) = LOWER(?) OR LOWER(sku) = LOWER(?)) AND id != ?",
                     [code, code, exceptId]);
    }
    const PART_COLS_STAFF = "id, name, sku, barcode, qty, min, price";

    /* =========================
       USERS / LOGIN
    ========================= */
    app.post("/api/users/login", (req, res) => {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");
        const key = username.toLowerCase();

        if (isLocked(key))
            return res.status(429).json({ message: "Too many wrong attempts. Try again in 10 minutes." });

        const user = get("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [username]);
        if (!user || !checkPassword(password, user.password)) {
            recordFail(key);
            return res.status(401).json({ message: "Invalid login details" });
        }
        failedLogins.delete(key);

        const token   = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + TZ_OFFSET_HOURS * 3600e3 + SESSION_DAYS * 86400e3)
                            .toISOString().replace("T", " ").slice(0, 19);
        run("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            [token, user.id, localNow(), expires]);
        res.json({ token, user: publicUser(user) });
    });

    app.get("/api/users/me", (req, res) =>
        requireAuth(req, res, () => res.json(publicUser(req.user)), true));

    app.post("/api/users/logout", (req, res) => {
        const user = loadSession(req);
        if (user) run("DELETE FROM sessions WHERE token = ?", [user.token]);
        res.json({ message: "Signed out" });
    });

    app.post("/api/users/change-password", (req, res) =>
        requireAuth(req, res, () => {
            const current = String(req.body?.current || "");
            const fresh   = String(req.body?.new || "");
            if (!checkPassword(current, req.user.password))
                return res.status(400).json({ message: "Current password is wrong" });
            if (fresh.length < 6)
                return res.status(400).json({ message: "New password must be at least 6 characters" });
            if (DEFAULT_PASSWORDS.includes(fresh) || fresh === current)
                return res.status(400).json({ message: "Choose a new password you haven't used here" });

            run("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?", [hashPassword(fresh), req.user.id], false);
            // sign out every other device for this user
            run("DELETE FROM sessions WHERE user_id = ? AND token != ?", [req.user.id, req.user.token], false);
            writeAudit({ user: req.user, action: "CHANGE_PASSWORD", note: "Password changed" });
            res.json({ message: "Password changed" });
        }, true));

    app.get("/api/users", requireAdmin, (req, res) => {
        res.json(query("SELECT id, username, role FROM users ORDER BY role, username"));
    });

    app.post("/api/users", requireAdmin, (req, res) => {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");
        const role     = req.body?.role === "admin" ? "admin" : "staff";

        if (!/^[A-Za-z0-9._-]{3,30}$/.test(username))
            return res.status(400).json({ message: "Username: 3–30 letters, numbers, dot, dash or underscore" });
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [username]))
            return res.status(400).json({ message: "Username already taken" });

        // New staff choose their own password on first sign-in
        const r = run("INSERT INTO users (username, password, role, must_change_password) VALUES (?, ?, ?, 1)",
            [username, hashPassword(password), role], false);
        writeAudit({ user: req.user, action: "ADD_USER", note: `Added ${role}: ${username}` });
        res.status(201).json({ id: r.lastInsertRowid, username, role });
    });

    app.delete("/api/users/:id", requireAdmin, (req, res) => {
        const id = toInt(req.params.id);
        if (id === req.user.id) return res.status(400).json({ message: "You can't remove yourself" });
        const user = get("SELECT * FROM users WHERE id = ?", [id]);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.role === "admin" && get("SELECT COUNT(*) AS c FROM users WHERE role='admin'").c <= 1)
            return res.status(400).json({ message: "Keep at least one admin" });
        run("DELETE FROM sessions WHERE user_id = ?", [id], false);
        run("DELETE FROM users WHERE id = ?", [id], false);
        writeAudit({ user: req.user, action: "DELETE_USER", note: `Removed: ${user.username}` });
        res.json({ message: "Removed" });
    });

    /* =========================
       PARTS
    ========================= */
    app.get("/api/parts", requireAuth, (req, res) => {
        const cols = req.user.role === "admin" ? "*" : PART_COLS_STAFF;
        res.json(query(`SELECT ${cols} FROM parts ORDER BY name ASC`));
    });

    app.post("/api/parts", requireAdmin, (req, res) => {
        const name  = String(req.body?.name || "").trim();
        const sku   = String(req.body?.sku || "").trim();
        const qty   = toInt(req.body?.qty ?? 0);
        const min   = toInt(req.body?.min ?? 5);
        const price = toNum(req.body?.price ?? 0);
        const cost  = toNum(req.body?.cost ?? 0);
        const bc    = cleanBarcode(req.body?.barcode);

        if (!name || !sku) return res.status(400).json({ message: "Name and SKU required" });
        if (bc.error) return res.status(400).json({ message: bc.error });
        if (barcodeTaken(bc.value)) return res.status(400).json({ message: "That barcode is already on another part" });
        if (!(qty >= 0) || !(min >= 0) || !(price >= 0) || !(cost >= 0))
            return res.status(400).json({ message: "Quantity, minimum, price and cost must be 0 or more" });
        if (get("SELECT id FROM parts WHERE LOWER(sku) = LOWER(?)", [sku]))
            return res.status(400).json({ message: "SKU already exists" });

        const r = run("INSERT INTO parts (name, sku, barcode, qty, min, price, cost) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [name, sku, bc.value, qty, min, price, cost], false);
        const part = get("SELECT * FROM parts WHERE id = ?", [r.lastInsertRowid]);
        writeAudit({ user: req.user, action: "ADD_PART", part, qtyBefore: 0, qtyAfter: qty, note: `Added at ₦${price}` });
        res.status(201).json(part);
    });

    // Admin: edit details. Only these named fields are read — nothing else in the request is used.
    app.put("/api/parts/:id", requireAdmin, (req, res) => {
        const id   = toInt(req.params.id);
        const part = get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });

        const b = req.body || {};
        const upd = {
            name:  b.name  !== undefined ? String(b.name).trim()  : part.name,
            sku:   b.sku   !== undefined ? String(b.sku).trim()   : part.sku,
            min:   b.min   !== undefined ? toInt(b.min)           : part.min,
            price: b.price !== undefined ? toNum(b.price)         : part.price,
            cost:  b.cost  !== undefined ? toNum(b.cost)          : part.cost,
            barcode: part.barcode ?? null,
        };
        if (b.barcode !== undefined) {
            const bc = cleanBarcode(b.barcode);
            if (bc.error) return res.status(400).json({ message: bc.error });
            if (barcodeTaken(bc.value, id)) return res.status(400).json({ message: "That barcode is already on another part" });
            upd.barcode = bc.value;
        }
        if (!upd.name || !upd.sku) return res.status(400).json({ message: "Name and SKU required" });
        if (!(upd.min >= 0) || !(upd.price >= 0) || !(upd.cost >= 0))
            return res.status(400).json({ message: "Minimum, price and cost must be 0 or more" });
        if (get("SELECT id FROM parts WHERE LOWER(sku) = LOWER(?) AND id != ?", [upd.sku, id]))
            return res.status(400).json({ message: "SKU already used by another part" });

        run("UPDATE parts SET name=?, sku=?, min=?, price=?, cost=?, barcode=? WHERE id=?",
            [upd.name, upd.sku, upd.min, upd.price, upd.cost, upd.barcode, id], false);
        const changes = Object.keys(upd).filter(k => upd[k] !== part[k])
            .map(k => `${k}: ${part[k]} → ${upd[k]}`).join(", ");
        writeAudit({ user: req.user, action: "EDIT_PART", part, note: changes || "No changes" });
        res.json(get("SELECT * FROM parts WHERE id = ?", [id]));
    });

    // Anyone signed in can restock (add stock). Only admins can correct stock down.
    app.post("/api/parts/:id/restock", requireAuth, (req, res) => {
        const id   = toInt(req.params.id);
        const add  = toInt(req.body?.qty);
        const part = get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        if (!(add > 0) || add > 100000) return res.status(400).json({ message: "Enter a valid quantity" });

        run("UPDATE parts SET qty = qty + ? WHERE id = ?", [add, id], false);
        writeAudit({ user: req.user, action: "RESTOCK", part, qtyBefore: part.qty, qtyAfter: part.qty + add,
                     note: `Restocked +${add} unit(s)` });
        res.json(get(`SELECT ${req.user.role === "admin" ? "*" : PART_COLS_STAFF} FROM parts WHERE id = ?`, [id]));
    });

    app.post("/api/parts/:id/adjust", requireAdmin, (req, res) => {
        const id     = toInt(req.params.id);
        const newQty = toInt(req.body?.qty);
        const reason = String(req.body?.reason || "").trim();
        const part   = get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        if (!(newQty >= 0)) return res.status(400).json({ message: "Enter a valid quantity" });
        if (!reason) return res.status(400).json({ message: "Give a reason (e.g. stock count, damaged)" });

        run("UPDATE parts SET qty = ? WHERE id = ?", [newQty, id], false);
        writeAudit({ user: req.user, action: "ADJUST", part, qtyBefore: part.qty, qtyAfter: newQty, note: reason });
        res.json(get("SELECT * FROM parts WHERE id = ?", [id]));
    });

    app.delete("/api/parts/:id", requireAdmin, (req, res) => {
        const id   = toInt(req.params.id);
        const part = get("SELECT * FROM parts WHERE id = ?", [id]);
        if (!part) return res.status(404).json({ message: "Part not found" });
        run("DELETE FROM parts WHERE id = ?", [id], false);
        writeAudit({ user: req.user, action: "DELETE_PART", part, qtyBefore: part.qty, qtyAfter: 0, note: "Removed from inventory" });
        res.json({ message: "Deleted" });
    });

    /* =========================
       SALES & RECEIPTS
    ========================= */
    function nextReceiptNo(date) {
        const prefix = `R-${date.replace(/-/g, "")}-`;
        const last = get("SELECT receipt_no FROM sales WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1", [prefix + "%"]);
        const n = last ? parseInt(last.receipt_no.slice(prefix.length), 10) + 1 : 1;
        return prefix + String(n).padStart(4, "0");
    }

    function saleWithItems(id, isAdmin) {
        const sale = get("SELECT * FROM sales WHERE id = ?", [id]);
        if (!sale) return null;
        sale.items = query("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id", [id]);
        if (!isAdmin) {
            delete sale.total_cost;
            sale.items.forEach(i => delete i.unit_cost);
        }
        return sale;
    }

    app.post("/api/sales", requireAuth, (req, res) => {
        const items    = Array.isArray(req.body?.items) ? req.body.items : [];
        const customer = String(req.body?.customer || "").trim().slice(0, 80) || null;
        const method   = ["cash", "pos", "transfer"].includes(req.body?.payment_method) ? req.body.payment_method : null;
        if (!method) return res.status(400).json({ message: "Choose how the customer paid" });
        if (!items.length) return res.status(400).json({ message: "Add at least one item" });
        if (items.length > 50) return res.status(400).json({ message: "Too many lines on one sale" });

        // Merge duplicate lines and check stock before touching anything
        const wanted = new Map();
        for (const it of items) {
            const pid = toInt(it?.part_id), q = toInt(it?.qty);
            if (!(pid > 0) || !(q > 0)) return res.status(400).json({ message: "Each item needs a part and a quantity" });
            wanted.set(pid, (wanted.get(pid) || 0) + q);
        }
        const lines = [];
        for (const [pid, q] of wanted) {
            const part = get("SELECT * FROM parts WHERE id = ?", [pid]);
            if (!part) return res.status(400).json({ message: "A part on this sale no longer exists" });
            if (part.qty < q) return res.status(400).json({ message: `Only ${part.qty} ${part.name} in stock` });
            lines.push({ part, qty: q });
        }

        const now   = localNow();
        const date  = now.slice(0, 10);
        const total = lines.reduce((s, l) => s + l.qty * l.part.price, 0);
        const cost  = lines.reduce((s, l) => s + l.qty * (l.part.cost || 0), 0);
        const count = lines.reduce((s, l) => s + l.qty, 0);

        try {
            db.run("BEGIN");
            const receipt = nextReceiptNo(date);
            const { lastInsertRowid: saleId } = run(
                `INSERT INTO sales (receipt_no, customer, total, total_cost, item_count, user_id, username, sale_date, created_at, payment_method)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [receipt, customer, total, cost, count, req.user.id, req.user.username, date, now, method], false);

            for (const { part, qty } of lines) {
                db.run(`INSERT INTO sale_items (sale_id, part_id, part_name, sku, qty, unit_price, unit_cost, line_total)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [saleId, part.id, part.name, part.sku, qty, part.price, part.cost || 0, qty * part.price]);
                db.run("UPDATE parts SET qty = qty - ? WHERE id = ?", [qty, part.id]);
                writeAudit({ user: req.user, action: "SALE", part, qtyBefore: part.qty, qtyAfter: part.qty - qty,
                             note: `${receipt}: sold ${qty} @ ₦${part.price}` }, false);
            }
            db.run("COMMIT");
            saveDb();
            res.status(201).json(saleWithItems(saleId, req.user.role === "admin"));
        } catch (e) {
            try { db.run("ROLLBACK"); } catch (_) {}
            console.error("Sale failed:", e.message);
            res.status(500).json({ message: "Sale could not be saved. Nothing was deducted." });
        }
    });

    // List sales for a day. Staff see only their own sales.
    app.get("/api/sales", requireAuth, (req, res) => {
        const date = isDate(req.query.date) ? req.query.date : localToday();
        const isAdmin = req.user.role === "admin";
        const rows = isAdmin
            ? query("SELECT * FROM sales WHERE sale_date = ? ORDER BY id DESC", [date])
            : query("SELECT * FROM sales WHERE sale_date = ? AND user_id = ? ORDER BY id DESC", [date, req.user.id]);
        if (!isAdmin) rows.forEach(r => delete r.total_cost);
        res.json({ date, sales: rows });
    });

    app.get("/api/sales/:id", requireAuth, (req, res) => {
        const isAdmin = req.user.role === "admin";
        const sale = saleWithItems(toInt(req.params.id), isAdmin);
        if (!sale || (!isAdmin && sale.user_id !== req.user.id))
            return res.status(404).json({ message: "Receipt not found" });
        res.json(sale);
    });

    /* =========================
       REPORTS (admin)
    ========================= */
    app.get("/api/reports/daily", requireAdmin, (req, res) => {
        const date = isDate(req.query.date) ? req.query.date : localToday();
        const sum  = get(`SELECT COUNT(*) AS sales, COALESCE(SUM(total),0) AS revenue,
                                 COALESCE(SUM(total_cost),0) AS cost, COALESCE(SUM(item_count),0) AS items
                          FROM sales WHERE sale_date = ?`, [date]);
        const topParts = query(`SELECT i.part_name, i.sku, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
                                FROM sale_items i JOIN sales s ON s.id = i.sale_id
                                WHERE s.sale_date = ? GROUP BY i.part_id, i.part_name
                                ORDER BY revenue DESC LIMIT 10`, [date]);
        const byStaff = query(`SELECT username, COUNT(*) AS sales, SUM(total) AS revenue
                               FROM sales WHERE sale_date = ? GROUP BY user_id, username
                               ORDER BY revenue DESC`, [date]);

        const start = shiftDate(date, -6);
        const rows  = query(`SELECT sale_date, SUM(total) AS revenue FROM sales
                             WHERE sale_date BETWEEN ? AND ? GROUP BY sale_date`, [start, date]);
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
            const d = shiftDate(date, -i);
            last7.push({ date: d, revenue: rows.find(r => r.sale_date === d)?.revenue || 0 });
        }

        const missingCost = get(`SELECT COUNT(*) AS c FROM sale_items i JOIN sales s ON s.id = i.sale_id
                                 WHERE s.sale_date = ? AND i.unit_cost = 0`, [date]).c;
        // Profit only counts lines where a cost price was recorded, so a missing cost never inflates it
        const profit = get(`SELECT COALESCE(SUM(i.line_total - i.qty * i.unit_cost), 0) AS p
                            FROM sale_items i JOIN sales s ON s.id = i.sale_id
                            WHERE s.sale_date = ? AND i.unit_cost > 0`, [date]).p;

        const byMethod = { cash: 0, pos: 0, transfer: 0 };
        for (const r of query("SELECT payment_method AS m, SUM(total) AS t FROM sales WHERE sale_date = ? GROUP BY payment_method", [date]))
            byMethod[r.m] = r.t;
        const close = get("SELECT * FROM day_close WHERE close_date = ?", [date]);

        res.json({
            date,
            by_method: byMethod,
            close,
            sales: sum.sales, items: sum.items,
            revenue: sum.revenue, cost: sum.cost, profit,
            missing_cost_lines: missingCost,
            top_parts: topParts, by_staff: byStaff, last7
        });
    });

    // End-of-day check: owner records what was actually counted / received
    app.post("/api/reports/close", requireAdmin, (req, res) => {
        const date = isDate(req.body?.date) ? req.body.date : null;
        const cash = toNum(req.body?.cash), pos = toNum(req.body?.pos), transfer = toNum(req.body?.transfer);
        const note = String(req.body?.note || "").trim().slice(0, 300) || null;
        if (!date) return res.status(400).json({ message: "Pick a date" });
        if (date > localToday()) return res.status(400).json({ message: "You can't close a day that hasn't happened" });
        if (!(cash >= 0) || !(pos >= 0) || !(transfer >= 0))
            return res.status(400).json({ message: "Enter amounts of 0 or more" });

        const before = get("SELECT * FROM day_close WHERE close_date = ?", [date]);
        db.run(`INSERT INTO day_close (close_date, cash_counted, pos_total, transfer_total, note, closed_by, closed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(close_date) DO UPDATE SET cash_counted=excluded.cash_counted, pos_total=excluded.pos_total,
                    transfer_total=excluded.transfer_total, note=excluded.note, closed_by=excluded.closed_by, closed_at=excluded.closed_at`,
            [date, cash, pos, transfer, note, req.user.username, localNow()]);
        writeAudit({ user: req.user, action: "DAY_CLOSE",
                     note: `${before ? "Updated" : "Closed"} ${date}: cash ₦${cash}, POS ₦${pos}, transfer ₦${transfer}` });
        res.json(get("SELECT * FROM day_close WHERE close_date = ?", [date]));
    });

    /* =========================
       AUDIT LOG
    ========================= */
    app.get("/api/audit", requireAdmin, (req, res) => {
        const limit  = Math.min(toInt(req.query.limit) || 100, 500);
        const offset = Math.max(toInt(req.query.offset) || 0, 0);
        const logs   = query("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
        const total  = get("SELECT COUNT(*) AS c FROM audit_log").c;
        res.json({ logs, total });
    });

    app.get("/api/health", (req, res) => res.json({ ok: true, time: localNow(), storage_permanent: STORAGE_PERMANENT }));

    // Admin: download a full copy of the data, to keep somewhere safe (Google Drive, flash drive)
    app.get("/api/admin/backup", requireAdmin, (req, res) => {
        saveDb();
        writeAudit({ user: req.user, action: "BACKUP", note: "Downloaded a full backup" });
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="spareparts-backup-${localNow().replace(/[: ]/g, "-")}.db"`);
        res.send(Buffer.from(db.export()));
    });

    // Admin: replace ALL data with a backup file (e.g. when moving to a new server).
    // The current data is kept as backups/before-restore-<time>.db first. The server then restarts.
    app.post("/api/admin/restore", express.raw({ type: "application/octet-stream", limit: "50mb" }), requireAdmin, (req, res) => {
        const buf = req.body;
        if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.subarray(0, 15).toString() !== "SQLite format 3")
            return res.status(400).json({ message: "That isn't a SpareParts backup file" });
        let test;
        try {
            test = new SQL.Database(buf);
            const tables = test.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.flat() || [];
            if (!tables.includes("parts") || !tables.includes("users")) throw new Error("missing tables");
            const admins = test.exec("SELECT COUNT(*) FROM users WHERE role='admin'")[0].values[0][0];
            if (!admins) throw new Error("no admin");
        } catch (e) {
            return res.status(400).json({ message: "That file isn't a usable SpareParts backup" });
        } finally {
            try { test?.close(); } catch (_) {}
        }
        writeAudit({ user: req.user, action: "RESTORE", note: "Replaced all data from a backup file" });
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(path.join(BACKUP_DIR, `before-restore-${localNow().replace(/[: ]/g, "-")}.db`), Buffer.from(db.export()));
        const tmp = DB_PATH + ".tmp";
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, DB_PATH);
        db = null;                                   // stop any further saves of the old data
        res.json({ message: "Backup restored. The app is restarting — sign in again in a minute." });
        console.log("♻️  Data restored from backup — restarting");
        setTimeout(() => process.exit(0), 500);     // the host starts it again with the restored data
    });

    app.get("/api/admin/storage", requireAdmin, (req, res) => {
        let backups = [];
        try { backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".db")).sort().reverse(); } catch (_) {}
        res.json({ permanent: STORAGE_PERMANENT, latest_backup: backups[0] || null, backups_kept: backups.length });
    });

    app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

    /* =========================
       SERVE THE APP ITSELF (same server for app + API, when the frontend folder is present)
    ========================= */
    const FRONTEND = path.join(__dirname, "..", "frontend");
    if (fs.existsSync(FRONTEND)) app.use(express.static(FRONTEND));

    app.listen(PORT, () => console.log(`✅ SpareParts server running on http://localhost:${PORT}`));
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
