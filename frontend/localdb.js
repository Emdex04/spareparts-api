/* SpareParts Pro — on-device SQL database (SQLite, via sql.js).
   Keeps a copy of customers, parts and sales history on this device, so customer history,
   "usually buys" and past sales work with no internet. The online server stays the master copy:
   this database is filled from it (LocalDB.sync) and saved in the device's own storage (IndexedDB),
   one database per shop server and person. If anything here fails, the app carries on without it. */
(function () {
    const SCHEMA = `
        CREATE TABLE IF NOT EXISTS meta      (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS parts     (id INTEGER PRIMARY KEY, name TEXT, sku TEXT, barcode TEXT, qty INTEGER, min INTEGER, price REAL);
        CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, consent INTEGER, note TEXT);
        CREATE TABLE IF NOT EXISTS sales     (id INTEGER PRIMARY KEY, receipt_no TEXT, customer_id INTEGER, customer TEXT, total REAL,
                                              item_count INTEGER, payment_method TEXT, username TEXT, created_at TEXT, status TEXT,
                                              void_type TEXT, void_reason TEXT, voided_by TEXT, voided_at TEXT);
        CREATE TABLE IF NOT EXISTS sale_items (sale_id INTEGER, part_id INTEGER, part_name TEXT, sku TEXT, qty INTEGER,
                                               unit_price REAL, line_total REAL);
        CREATE INDEX IF NOT EXISTS ix_sales_customer ON sales(customer_id);
        CREATE INDEX IF NOT EXISTS ix_sales_day      ON sales(substr(created_at, 1, 10));
        CREATE INDEX IF NOT EXISTS ix_items_sale     ON sale_items(sale_id);`;

    let SQL = null, db = null, scope = null, saveTimer = null, syncing = null;

    /* Device storage (IndexedDB) for the database file ------------------------ */
    function idb() {
        return new Promise((ok, fail) => {
            const r = indexedDB.open("spareparts-local", 1);
            r.onupgradeneeded = () => r.result.createObjectStore("files");
            r.onsuccess = () => ok(r.result);
            r.onerror = () => fail(r.error);
        });
    }
    async function readFile(key) {
        const d = await idb();
        return new Promise(ok => {
            const q = d.transaction("files").objectStore("files").get(key);
            q.onsuccess = () => ok(q.result || null);
            q.onerror = () => ok(null);
        });
    }
    async function writeFile(key, bytes) {
        const d = await idb();
        return new Promise(ok => {
            const t = d.transaction("files", "readwrite");
            t.objectStore("files").put(bytes, key);
            t.oncomplete = () => ok(true);
            t.onerror = () => ok(false);
        });
    }
    function saveSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { if (db && scope) writeFile(scope, db.export()).catch(() => {}); }, 400);
    }

    /* Helpers ----------------------------------------------------------------- */
    function all(sql, params = []) {
        const st = db.prepare(sql);
        st.bind(params);
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        st.free();
        return rows;
    }
    const one = (sql, params) => all(sql, params)[0] || null;
    function meta(key, value) {
        if (value === undefined) return one("SELECT value FROM meta WHERE key = ?", [key])?.value ?? null;
        db.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, String(value)]);
    }
    function loadScript(src) {
        return new Promise((ok, fail) => {
            const s = document.createElement("script");
            s.src = src; s.onload = ok; s.onerror = fail;
            document.head.appendChild(s);
        });
    }

    const LocalDB = {
        ready: false,

        // Open (or create) this person's database for this shop server
        async open(newScope) {
            try {
                if (!window.indexedDB) return false;
                if (!SQL) {
                    if (!window.initSqlJs) await loadScript("vendor/sqljs/sql-wasm.js");
                    SQL = await window.initSqlJs({ locateFile: f => "vendor/sqljs/" + f });
                }
                if (scope === newScope && db) return true;
                const bytes = await readFile(newScope);
                db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
                db.run(SCHEMA);
                scope = newScope;
                this.ready = true;
                return true;
            } catch (e) {
                console.warn("On-device database not available:", e);
                this.ready = false;
                return false;
            }
        },
        close() { db = null; scope = null; this.ready = false; },

        // Copy new sales (and cancellations) from the server, a page at a time
        async sync(apiFetch) {
            if (!this.ready) return 0;
            if (syncing) return syncing;
            syncing = (async () => {
                let added = 0;
                try {
                    for (let page = 0; page < 40; page++) {
                        const sinceId = Number(meta("last_sale_id") || 0);
                        const since = meta("last_sync") || "";
                        const r = await apiFetch(`/sync?since_id=${sinceId}&since=${encodeURIComponent(since)}`);
                        db.run("BEGIN");
                        for (const s of r.sales)
                            db.run(`INSERT OR REPLACE INTO sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                                [s.id, s.receipt_no, s.customer_id, s.customer, s.total, s.item_count, s.payment_method, s.username,
                                 s.created_at, s.status, s.void_type, s.void_reason, s.voided_by, s.voided_at]);
                        if (r.sales.length) db.run(`DELETE FROM sale_items WHERE sale_id IN (${r.sales.map(() => "?").join(",")})`, r.sales.map(s => s.id));
                        for (const i of r.items)
                            db.run("INSERT INTO sale_items VALUES (?,?,?,?,?,?,?)", [i.sale_id, i.part_id, i.part_name, i.sku, i.qty, i.unit_price, i.line_total]);
                        for (const c of r.changed)
                            db.run("UPDATE sales SET status=?, void_type=?, void_reason=?, voided_by=?, voided_at=? WHERE id=?",
                                [c.status, c.void_type, c.void_reason, c.voided_by, c.voided_at, c.id]);
                        meta("last_sale_id", r.last_id);
                        if (!r.more) meta("last_sync", r.server_time);
                        db.run("COMMIT");
                        added += r.sales.length;
                        if (!r.more) break;
                    }
                } catch (e) {
                    try { db.run("ROLLBACK"); } catch (_) {}
                    if (!e.offline) console.warn("Sync stopped:", e.message);
                } finally {
                    saveSoon();
                    syncing = null;
                }
                return added;
            })();
            return syncing;
        },

        // Keep the latest customers and parts the app received
        saveCustomers(list) {
            if (!this.ready) return;
            db.run("BEGIN");
            db.run("DELETE FROM customers");
            for (const c of list) if (c.id > 0)
                db.run("INSERT INTO customers VALUES (?,?,?,?,?,?)", [c.id, c.name, c.phone, c.email, c.consent ? 1 : 0, c.note]);
            db.run("COMMIT");
            saveSoon();
        },
        saveParts(list) {
            if (!this.ready) return;
            db.run("BEGIN");
            db.run("DELETE FROM parts");
            for (const p of list) db.run("INSERT INTO parts VALUES (?,?,?,?,?,?,?)", [p.id, p.name, p.sku, p.barcode, p.qty, p.min, p.price]);
            db.run("COMMIT");
            saveSoon();
        },

        // Parts a customer bought on at least `after` separate visits — their usual purchases
        favourites(customerId, after = 3) {
            if (!this.ready || !(customerId > 0)) return [];
            return all(`SELECT i.part_id, MAX(i.part_name) AS part_name, COUNT(DISTINCT s.id) AS times,
                               SUM(i.qty) AS qty, MAX(s.created_at) AS last_bought
                        FROM sale_items i JOIN sales s ON s.id = i.sale_id
                        WHERE s.customer_id = ? AND s.status = 'completed' AND i.part_id IS NOT NULL
                        GROUP BY i.part_id HAVING times >= ? ORDER BY times DESC, last_bought DESC LIMIT 8`, [customerId, after]);
        },

        // A customer's profile and full purchase history, built from this device's copy
        customerProfile(id) {
            if (!this.ready) return null;
            const c = one("SELECT * FROM customers WHERE id = ?", [id]);
            if (!c) return null;
            const sales = all(`SELECT id, receipt_no, total, item_count, payment_method, username, created_at, status, void_type
                               FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 200`, [id]);
            const items = all(`SELECT sale_id, part_name, qty, unit_price, line_total FROM sale_items
                               WHERE sale_id IN (SELECT id FROM sales WHERE customer_id = ?)`, [id]);
            for (const s of sales) s.items = items.filter(i => i.sale_id === s.id);
            const done = sales.filter(s => s.status === "completed");
            return { ...c, sales, visits: done.length, spent: done.reduce((t, s) => t + s.total, 0),
                     last_visit: done[0]?.created_at || null, from_device: true };
        },

        // Sales on one day (for the sales list without internet)
        salesOn(date, username = null) {
            if (!this.ready) return null;
            return all(`SELECT * FROM sales WHERE substr(created_at, 1, 10) = ? ${username ? "AND username = ?" : ""} ORDER BY id DESC`,
                       username ? [date, username] : [date]);
        },
        // One receipt
        sale(id) {
            if (!this.ready) return null;
            const s = one("SELECT * FROM sales WHERE id = ?", [id]);
            if (!s) return null;
            s.items = all("SELECT * FROM sale_items WHERE sale_id = ?", [id]);
            const c = s.customer_id ? one("SELECT id, name, phone, email, consent FROM customers WHERE id = ?", [s.customer_id]) : null;
            return { ...s, customer_info: c };
        },
        stats() {
            if (!this.ready) return null;
            return { sales: one("SELECT COUNT(*) AS n FROM sales").n, customers: one("SELECT COUNT(*) AS n FROM customers").n,
                     last_sync: meta("last_sync") };
        }
    };
    window.LocalDB = LocalDB;
})();
