/* ==================================================================
   SpareParts Pro — app script
   Sections: state · formatting · server calls · theme · sign-in ·
   navigation · dashboard · stock · selling · receipts · reports ·
   barcodes & scanner · labels · settings (shop, staff, backups) ·
   activity log · modals & toasts
================================================================== */

/* ------------------------------------------------------------------
   STATE
------------------------------------------------------------------ */
const state = {
    user: null,
    token: null,
    shop: { name: "", address: "", phone: "", receipt_note: "" },
    parts: [],
    users: [],
    cart: [],              // [{ part_id, qty }]
    currentFilter: "all",
    restockTargetId: null,
    editTargetId: null,
    lastReceipt: null,
    payMethod: null,       // "cash" | "pos" | "transfer"
    scanTarget: null,
    labelCopies: {}        // part_id -> labels to print
};

/* Where the shop's data lives.
   - Website: the same server that served the page.
   - Installed app (Windows / Android): the app's files are on the device, the data is on the shop's
     online server. Each shop (e.g. a tester's own copy) can point the app at its own server. */
const DEFAULT_SERVER = "https://spareparts-api-4343.onrender.com";
const IN_APP = location.protocol === "app:" || location.protocol === "file:" || !!window.Capacitor ||
               (location.protocol === "https:" && location.hostname === "localhost" && !location.port);   // Android app
function serverUrl() {
    return (load("sp_server") || DEFAULT_SERVER).trim().replace(/\/+$/, "");
}
function apiBase() {
    if (IN_APP) return serverUrl() + "/api";
    const h = location.hostname;
    const local = h === "localhost" || h === "127.0.0.1";
    if (local && location.port !== "5000") return "http://localhost:5000/api";
    if (local || h.endsWith("onrender.com")) return "/api";   // page served by the API server itself
    return DEFAULT_SERVER + "/api";
}

const $ = id => document.getElementById(id);
const isAdmin = () => state.user?.role === "admin";
const shopName = () => state.shop.name || "SpareParts Pro";

/* ------------------------------------------------------------------
   FORMATTING — dates, times, money, codes
   Server times are shop time (Lagos) written as "YYYY-MM-DD HH:MM:SS".
------------------------------------------------------------------ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ₦13,000 — kobo only shown when there is some
function naira(n) {
    const v = Number(n || 0);
    return "₦" + v.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}
// Big amounts read short: ₦2.53M, ₦1.2B (₦850K in tight spaces). Point at it (or tap on a phone) to see the exact amount.
// Receipts, WhatsApp receipts and printed labels always show the full amount.
function nairaShort(n, from = 1e5) {
    const v = Number(n || 0), a = Math.abs(v);
    if (a >= 1e9) return "₦" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "₦" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e5 && from <= 1e5) return "₦" + +(v / 1e3).toFixed(0) + "K";
    return naira(v);
}
function shortSpan(n, from) {
    const full = naira(n), short = nairaShort(n, from);
    return short === full ? full
        : `<span class="amt" title="${full}" data-full="${full}" data-short="${short}" tabindex="0" role="button" aria-label="${full}">${short}</span>`;
}
const money      = n => shortSpan(n, 1e6);   // tables, lists, totals: shortened from ₦1M
const moneyShort = n => shortSpan(n, 1e5);   // summary cards and chart labels: shortened from ₦100K
// Phones have no hover: tap a short amount to see the full one, tap again to shorten it
document.addEventListener("click", e => {
    const el = e.target.closest?.(".amt");
    if (!el || !matchMedia("(hover: none)").matches) return;     // computers use hover instead
    e.stopPropagation();
    el.textContent = el.textContent === el.dataset.full ? el.dataset.short : el.dataset.full;
}, true);
const count = (n, one, many) => `${Number(n).toLocaleString("en-NG")} ${n === 1 ? one : (many ?? one + "s")}`;

function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseStamp(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || "");
    return m ? { y: +m[1], mo: +m[2], d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null, day: `${m[1]}-${m[2]}-${m[3]}` } : null;
}
function fmtTime(s) {                          // 1:45 pm
    const p = parseStamp(s);
    if (!p || p.h == null) return "";
    return `${p.h % 12 || 12}:${String(p.mi).padStart(2, "0")} ${p.h < 12 ? "am" : "pm"}`;
}
function dayDiff(day) {                        // 0 = today, 1 = yesterday
    return Math.round((new Date(todayLocal() + "T12:00:00") - new Date(day + "T12:00:00")) / 86400000);
}
function fmtDate(s, { year = "auto" } = {}) {  // 22 Oct · 22 Oct 2025
    const p = parseStamp(s);
    if (!p) return "";
    const showYear = year === true || (year === "auto" && p.y !== new Date().getFullYear());
    return `${p.d} ${MONTHS[p.mo - 1]}${showYear ? " " + p.y : ""}`;
}
function fmtWhen(s) {                          // Today, 1:45 pm · Yesterday, 4:22 pm · 8 May, 4:22 am
    const p = parseStamp(s);
    if (!p) return "";
    const diff = dayDiff(p.day);
    const day = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : fmtDate(s);
    const t = fmtTime(s);
    return t ? `${day}, ${t}` : day;
}
function fmtDayLong(day) {                     // Thursday, 22 October 2026
    const p = parseStamp(day);
    if (!p) return "";
    return `${DAYS[new Date(p.day + "T12:00:00").getDay()]}, ${p.d} ${MONTHS_LONG[p.mo - 1]} ${p.y}`;
}
const fmtDayShort = day => DAYS[new Date(day + "T12:00:00").getDay()].slice(0, 3);
function dayName(day) {
    const diff = dayDiff(day);
    return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : fmtDayLong(day);
}

// R-20261022-0007 -> "No. 7" (the full number is kept small on the receipt for look-ups)
function receiptShort(no) {
    const m = /-(\d+)$/.exec(no || "");
    return m ? `No. ${parseInt(m[1], 10)}` : (no || "");
}
const PAY_LABELS = { cash: "Cash", pos: "POS", transfer: "Transfer" };
const PAY_ICONS  = { cash: "fa-money-bill-wave", pos: "fa-credit-card", transfer: "fa-building-columns" };

/* ------------------------------------------------------------------
   PER-DEVICE STORAGE (conveniences only)
------------------------------------------------------------------ */
function store(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {}
}
function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
}

/* ------------------------------------------------------------------
   SERVER CALLS
------------------------------------------------------------------ */
async function apiFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
        res = await fetch(`${apiBase()}${path}`, { ...options, headers });
    } catch (_) {
        throw Object.assign(new Error("Can't reach the server. Check your internet connection."), { offline: true });
    }
    // 503 from the app's offline helper (sw.js), or the host waking up / down
    if (res.status === 503 || res.status === 502 || res.status === 504)
        throw Object.assign(new Error("Can't reach the server right now. Check your internet connection."), { offline: true });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/users/login") {
        signOutLocal("Your session ended. Please sign in again.");
        throw new Error(data.message || "Please sign in again");
    }
    if (res.status === 403 && data.code === "MUST_CHANGE_PASSWORD") {
        openPasswordModal(true);
        throw new Error(data.message);
    }
    if (!res.ok) throw new Error(data.message || `Something went wrong (${res.status})`);
    return data;
}

/* ------------------------------------------------------------------
   THEME
------------------------------------------------------------------ */
function applyThemeLabel() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    document.querySelectorAll(".theme-label").forEach(el => el.textContent = light ? "Dark mode" : "Light mode");
}
function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    store("sp_theme", next);
    applyThemeLabel();
}

/* ------------------------------------------------------------------
   SHOP NAME (shown on sign-in, sidebar and receipts)
------------------------------------------------------------------ */
async function loadShopName() {
    try {
        const s = await apiFetch("/settings/public");
        state.shop = { ...state.shop, ...s };
    } catch (_) {}
    applyShopName();
}
function applyShopName() {
    document.querySelectorAll(".shop-name").forEach(el => el.textContent = shopName());
    document.title = state.shop.name ? `${state.shop.name} · SpareParts Pro` : "SpareParts Pro";
}

/* ------------------------------------------------------------------
   SIGN-IN
------------------------------------------------------------------ */
async function handleLogin() {
    const username = $("loginUser").value.trim();
    const password = $("loginPass").value;
    const btn = $("loginBtn");
    if (!username || !password) { showLoginError("Enter your username and password"); return; }

    btn.classList.add("loading"); btn.disabled = true; btn.textContent = "Signing in…";
    $("loginError").style.display = "none";
    try {
        const { token, user } = await apiFetch("/users/login", { method: "POST", body: JSON.stringify({ username, password }) });
        state.token = token;
        store("sp_token", token);
        $("loginPass").value = "";
        await enterApp(user);
    } catch (err) {
        showLoginError(err.message || "Wrong username or password");
    } finally {
        btn.classList.remove("loading"); btn.disabled = false; btn.textContent = "Sign in";
    }
}

function showLoginError(msg) {
    const el = $("loginError");
    el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>${esc(msg)}`;
    el.style.display = "block";
}

async function enterApp(user) {
    state.user = user;
    store("sp_user", JSON.stringify(user));
    $("userDisplayName").textContent = user.username;
    $("userAvatar").textContent = user.username.charAt(0).toUpperCase();
    const chip = $("userRoleBadge");
    chip.textContent = user.role === "admin" ? "Owner" : "Staff";
    chip.className = "role-chip" + (user.role === "admin" ? " admin" : "");

    document.querySelectorAll(".admin-only").forEach(el => el.hidden = user.role !== "admin");
    buildMobileNav();

    $("loginScreen").style.display = "none";
    $("appContainer").style.display = "block";
    applyThemeLabel();

    if (user.must_change_password) { openPasswordModal(true); return; }
    await initApp();
    showSection("dashboard");
}

async function resumeSession() {
    const saved = load("sp_token");
    if (!saved) return;
    state.token = saved;
    try {
        await enterApp(await apiFetch("/users/me"));
    } catch (err) {
        // No internet: stay signed in with what this phone knew last time (the server still checks every action later)
        const cachedUser = (() => { try { return JSON.parse(load("sp_user") || "null"); } catch (_) { return null; } })();
        if (err.offline && cachedUser && !cachedUser.must_change_password) { await enterApp(cachedUser); return; }
        state.token = null;
        store("sp_token", null);
    }
}

function signOutLocal(msg) {
    Object.assign(state, { token: null, user: null, cart: [], payMethod: null });
    store("sp_token", null);
    $("appContainer").style.display = "none";
    $("loginScreen").style.display = "";
    document.querySelectorAll(".modal-overlay.open").forEach(m => { m.dataset.forced = ""; m.classList.remove("open"); });
    if (msg) showLoginError(msg);
}

async function logout() {
    const waiting = getPending().length;
    if (waiting && !confirm(`${count(waiting, "thing")} recorded on this phone haven't reached the shop records yet. They'll be sent next time you sign in here. Sign out anyway?`)) return;
    try { await apiFetch("/users/logout", { method: "POST" }); } catch (_) {}
    store("sp_user", null);
    signOutLocal();
    location.reload();
}

/* Installed app: choose the shop's server (each tester's shop has its own) */
function showServerBox() {
    if (!IN_APP) return;
    $("serverBox").hidden = false;
    $("serverName").textContent = serverUrl().replace(/^https?:\/\//, "");
}
function toggleServerForm(open) {
    $("serverForm").hidden = !open;
    if (open) { $("serverInput").value = serverUrl(); $("serverMsg").textContent = "The owner gives you this address. Each shop has its own."; $("serverInput").focus(); }
}
function useDefaultServer() { $("serverInput").value = DEFAULT_SERVER; saveServer(); }
async function saveServer() {
    let url = $("serverInput").value.trim().replace(/\/+$/, "");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const btn = $("serverSaveBtn"), msg = $("serverMsg");
    btn.disabled = true; msg.textContent = "Checking… (a sleeping server can take up to a minute to wake)";
    try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 75000);
        const res = await fetch(url + "/api/health", { signal: ctl.signal });
        const data = await res.json();
        if (!data.ok) throw new Error();
    } catch (_) {
        msg.textContent = "Couldn't reach a SpareParts server at that address. Check it and your internet.";
        btn.disabled = false;
        return;
    }
    btn.disabled = false;
    if (url === serverUrl()) { toggleServerForm(false); return; }
    // A different shop: forget this device's sign-in and saved stock list from the old one
    store("sp_server", url === DEFAULT_SERVER ? null : url);
    ["sp_token", "sp_user", "sp_parts_cache"].forEach(k => store(k, null));
    state.shop = { name: "", address: "", phone: "", receipt_note: "" };
    toggleServerForm(false);
    showServerBox();
    loadShopName();
    toast("Server saved. Sign in with your account for this shop.", "success");
}

document.addEventListener("DOMContentLoaded", () => {
    ["loginUser", "loginPass"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); }));
    showServerBox();
    applyThemeLabel();
    loadShopName();
    resumeSession();
});

/* Change password ------------------------------------------------- */
function openPasswordModal(forced = false) {
    ["pwCurrent", "pwNew", "pwConfirm"].forEach(id => $(id).value = "");
    $("pwForcedNote").hidden = !forced;
    $("pwCancelBtn").hidden = forced;
    $("passwordModal").dataset.forced = forced ? "1" : "";
    closeModal("moreSheet");
    openModal("passwordModal");
}

async function confirmPasswordChange() {
    const current = $("pwCurrent").value, fresh = $("pwNew").value, again = $("pwConfirm").value;
    if (!current || !fresh) return toast("Fill in all three boxes", "error");
    if (fresh !== again)    return toast("The new passwords don't match", "error");
    if (fresh.length < 6)   return toast("Use at least 6 characters", "error");
    try {
        await apiFetch("/users/change-password", { method: "POST", body: JSON.stringify({ current, new: fresh }) });
        toast("Password changed", "success");
        const wasForced = $("passwordModal").dataset.forced === "1";
        closeModal("passwordModal", true);
        if (wasForced) {
            state.user.must_change_password = false;
            await initApp();
            showSection("dashboard");
        }
    } catch (err) {
        toast(err.message, "error");
    }
}

/* ------------------------------------------------------------------
   NAVIGATION
------------------------------------------------------------------ */
function buildMobileNav() {
    const items = [
        ["dashboard", "fa-house", "Home"],
        ["inventory", "fa-boxes-stacked", "Stock"],
        ["sales", "fa-cash-register", "Sell", "sell"],
        isAdmin() ? ["reports", "fa-chart-column", "Report"] : null,
        ["more", "fa-bars", "More"]
    ].filter(Boolean);
    const nav = $("mobileNav");
    nav.style.setProperty("--nav-count", items.length);
    nav.innerHTML = items.map(([id, icon, label, cls]) => `
        <button class="mobile-nav-btn ${cls || ""}" data-section="${id}" onclick="${id === "more" ? "openMoreSheet()" : `showSection('${id}')`}">
            <i class="fa-solid ${icon}"></i><span>${label}</span>
            ${id === "inventory" ? `<span class="badge" id="mLowBadge" hidden></span>` : ""}
        </button>`).join("");
}

function openMoreSheet() {
    const item = (icon, label, action, cls = "") =>
        `<button class="sheet-item ${cls}" onclick="closeModal('moreSheet');${action}"><i class="fa-solid ${icon}"></i>${label}</button>`;
    $("moreSheetBody").innerHTML = `
        <div class="user-card" style="padding:0 0 12px;">
            <div class="avatar">${esc(state.user.username.charAt(0).toUpperCase())}</div>
            <div><strong>${esc(state.user.username)}</strong><span class="role-chip ${isAdmin() ? "admin" : ""}">${isAdmin() ? "Owner" : "Staff"}</span></div>
        </div>
        ${item("fa-address-book", "Customers", "showSection('customers')")}
        ${item("fa-clipboard-check", "Stock count", "showSection('counts')")}
        ${isAdmin() ? item("fa-barcode", "Barcode labels", "showSection('labels')") : ""}
        ${isAdmin() ? item("fa-clock-rotate-left", "Activity log", "showSection('audit')") : ""}
        ${isAdmin() ? item("fa-gear", "Settings, staff & backups", "showSection('users')") : ""}
        ${item("fa-circle-half-stroke", `<span class="theme-label"></span>`, "toggleTheme()")}
        ${item("fa-key", "Change password", "openPasswordModal()")}
        ${item("fa-arrow-right-from-bracket", "Sign out", "logout()", "danger")}`;
    applyThemeLabel();
    openModal("moreSheet");
}

function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.toggle("active", s.id === id));
    document.querySelectorAll(".nav-btn, .mobile-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.section === id));
    if (id === "dashboard") renderDashboard(true);
    if (id === "sales")     loadSalesHistory();
    if (id === "reports")   loadReport();
    if (id === "counts")    loadCounts();
    if (id === "customers") loadCustomers();
    if (id === "labels")    renderLabelPicker();
    if (id === "audit")     loadAuditLog();
    if (id === "users")     { loadUsers(); checkStorage(); fillShopForm(); }
    if (id !== "sales" && id !== "counts") stopScanner();
    window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------
   LOADING DATA
------------------------------------------------------------------ */
async function initApp() {
    await Promise.all([fetchParts(), fetchShop(), fetchCustomers()]);
    renderPending();
    syncPending();
    if (isAdmin()) {
        checkStorage().catch(() => {});
        apiFetch("/counts").then(updateCountBadge).catch(() => {});   // counts waiting for the owner
    }
}

async function fetchShop() {
    try { state.shop = await apiFetch("/settings"); } catch (_) {}
    applyShopName();
}

async function fetchParts() {
    try {
        state.parts = await apiFetch("/parts");
        applyPendingToParts(state.parts);       // sales / restocks made offline that the server hasn't had yet
        store("sp_parts_cache", JSON.stringify(state.parts));
        renderAll();
    } catch (err) {
        // Offline: use the last stock list this phone saw, so selling can carry on
        const cached = load("sp_parts_cache");
        if (err.offline && cached) {
            try { state.parts = JSON.parse(cached); renderAll(); } catch (_) {}
            toast("No internet — showing the stock list from your last connection", "info");
        } else toast(err.message || "Couldn't load your stock", "error");
    }
}

function renderAll() {
    renderInventory();
    renderDashboard(false);
    populateSaleDropdown();
    renderCart();
    updateLowBadge();
    if ($("labels").classList.contains("active")) renderLabelPicker();
}

/* ------------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------ */
function getStatus(p) {
    if (!p || p.qty <= 0)      return "out";
    if (p.qty <= (p.min ?? 5)) return "low";
    return "ok";
}
const STATUS_LABEL = { ok: "In stock", low: "Running low", out: "Out of stock" };

function greeting() {
    const h = new Date().getHours();
    return (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + ", " + (state.user?.username || "");
}

function renderDashboard(withSales) {
    $("greeting").textContent = greeting();
    $("todayLong").textContent = fmtDayLong(todayLocal());

    const parts = state.parts;
    const low   = parts.filter(p => getStatus(p) === "low");
    const out   = parts.filter(p => getStatus(p) === "out");
    const value = parts.reduce((s, p) => s + p.price * Math.max(p.qty, 0), 0);
    const units = parts.reduce((s, p) => s + Math.max(p.qty, 0), 0);

    $("statsGrid").innerHTML = `
        <div class="stat blue clickable" onclick="showStock('all')">
            <div class="label"><i class="fa-solid fa-boxes-stacked"></i>Parts</div>
            <div class="value">${parts.length.toLocaleString("en-NG")}</div>
            <div class="sub">${count(units, "item")} on the shelves</div>
        </div>
        <div class="stat amber clickable" onclick="showStock('low')">
            <div class="label"><i class="fa-solid fa-arrow-trend-down"></i>Running low</div>
            <div class="value">${low.length}</div>
            <div class="sub">${low.length ? "reorder soon" : "nothing to reorder"}</div>
        </div>
        <div class="stat red clickable" onclick="showStock('out')">
            <div class="label"><i class="fa-solid fa-ban"></i>Out of stock</div>
            <div class="value">${out.length}</div>
            <div class="sub">${out.length ? "can't be sold now" : "all available"}</div>
        </div>
        <div class="stat green">
            <div class="label"><i class="fa-solid fa-sack-dollar"></i>Stock value</div>
            <div class="value">${moneyShort(value)}</div>
            <div class="sub">at selling price</div>
        </div>`;

    const need = [...out, ...low].slice(0, 6);
    $("lowStockBox").innerHTML = need.length ? `
        <div class="section-title">Reorder soon</div>
        <div class="list">${need.map(p => {
            const s = getStatus(p);
            return `
            <div class="list-row">
                <div class="list-icon" style="background:var(--${s}-bg);color:var(--${s})"><i class="fa-solid fa-box"></i></div>
                <div class="list-main"><strong>${esc(p.name)}</strong><div class="muted">${esc(p.sku)}</div></div>
                <span class="pill ${s}">${p.qty <= 0 ? "None left" : `${p.qty} left`}</span>
                <button class="btn btn-soft btn-sm" onclick="openRestockModal(${p.id})"><i class="fa-solid fa-plus"></i> Stock</button>
            </div>`;
        }).join("")}</div>` : "";

    if (withSales) loadTodaySummary();
}

function showStock(filter) {
    showSection("inventory");
    setFilter(filter, document.querySelector(`#inventory .chip[data-filter="${filter}"]`));
}

async function loadTodaySummary() {
    const list = $("activityList");
    try {
        const { sales } = await apiFetch(`/sales?date=${todayLocal()}`);
        const kept = sales.filter(isLive);
        const total = kept.reduce((s, x) => s + x.total, 0);
        $("todayHeading").innerHTML = `${isAdmin() ? "Today's sales" : "Your sales today"} <span class="muted">${count(kept.length, "sale")} · ${money(total)}</span>`;
        list.innerHTML = sales.length ? sales.slice(0, 8).map(saleRow).join("")
            : `<div class="empty" style="border:0;"><i class="fa-solid fa-receipt"></i>No sales yet today.</div>`;
    } catch (err) {
        list.innerHTML = `<div class="empty" style="border:0;">${err.offline
            ? "No internet — today's sales will show when you're back online. You can still sell."
            : "Couldn't load today's sales."}</div>`;
    }
}

function saleRow(s) {
    return `
        <div class="list-row clickable ${isLive(s) ? "" : "voided"}" onclick="viewReceipt(${s.id})">
            <div class="list-icon"><i class="fa-solid ${PAY_ICONS[s.payment_method] || "fa-receipt"}"></i></div>
            <div class="list-main">
                <strong>${esc(s.customer || "Walk-in customer")}</strong> ${voidChip(s)}
                <div class="muted">${receiptShort(s.receipt_no)} · ${count(s.item_count, "item")} · ${esc(PAY_LABELS[s.payment_method] || "Cash")}${isAdmin() ? " · " + esc(s.username) : ""}</div>
            </div>
            <div class="list-end"><strong>${money(s.total)}</strong><span class="muted small">${fmtTime(s.created_at)}</span></div>
        </div>`;
}
// Cancelled / returned sales stay on record but don't count in any total
const isLive = s => s.status !== "voided";
const voidChip = s => isLive(s) ? "" : `<span class="pill out small-pill">${s.void_type === "return" ? "Returned" : "Cancelled"}</span>`;

/* ------------------------------------------------------------------
   STOCK
------------------------------------------------------------------ */
function renderInventory() {
    const parts = filteredParts();
    $("emptyState").hidden = parts.length > 0;
    $("partsTableBody").innerHTML = parts.map(p => {
        const s = getStatus(p);
        return `
        <tr>
            <td class="card-title">
                <div class="part-name">${esc(p.name)}</div>
                <div class="part-sub"><span class="code">${esc(p.sku)}</span>
                    ${p.barcode ? `<span class="tag" title="Has a barcode"><i class="fa-solid fa-barcode"></i>Barcode</span>` : ""}</div>
            </td>
            <td class="num" data-label="In stock"><strong>${p.qty.toLocaleString("en-NG")}</strong></td>
            <td data-label="Status"><span class="pill ${s}">${STATUS_LABEL[s]}</span></td>
            <td class="num" data-label="Price"><span>${money(p.price)}${isAdmin() && p.cost ? `<span class="muted small block">cost ${money(p.cost)}</span>` : ""}</span></td>
            <td class="actions">
                <button class="btn btn-soft btn-sm" onclick="openRestockModal(${p.id})"><i class="fa-solid fa-plus"></i> Stock</button>
                ${isAdmin() ? `
                <button class="btn btn-secondary btn-sm" onclick="openEditModal(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
                <button class="btn btn-danger-soft btn-sm btn-icon" title="Delete" onclick="deletePart(${p.id})"><i class="fa-solid fa-trash"></i></button>` : ""}
            </td>
        </tr>`;
    }).join("");
}

function filteredParts() {
    const q = ($("searchInput").value || "").toLowerCase().trim();
    let list = state.parts;
    if (state.currentFilter !== "all") list = list.filter(p => getStatus(p) === state.currentFilter);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
        || (p.barcode || "").toLowerCase().includes(q) || shopCode(p.id) === q);
    return list;
}
function setFilter(filter, btn) {
    state.currentFilter = filter;
    document.querySelectorAll("#inventory .chip").forEach(b => b.classList.toggle("active", b === btn));
    renderInventory();
}
function applyFilterAndSearch() { renderInventory(); }

function updateLowBadge() {
    const n = state.parts.filter(p => getStatus(p) !== "ok").length;
    ["lowBadge", "mLowBadge"].forEach(id => { const b = $(id); if (b) { b.textContent = n; b.hidden = n === 0; } });
}

/* Restock --------------------------------------------------------- */
function openRestockModal(id) {
    const p = state.parts.find(x => x.id === id);
    if (!p) return;
    state.restockTargetId = id;
    $("restockPartName").textContent = `${p.name} — ${p.qty} in stock now`;
    $("restockQty").value = "";
    openModal("restockModal");
    setTimeout(() => $("restockQty").focus(), 50);
}
async function confirmRestock() {
    const qty = parseInt($("restockQty").value);
    if (!(qty > 0)) return toast("Enter how many arrived", "error");
    const p = state.parts.find(x => x.id === state.restockTargetId);
    if (!p) return;
    const ref = newRef();
    try {
        await apiFetch(`/parts/${p.id}/restock`, { method: "POST", body: JSON.stringify({ qty, client_ref: ref }) });
        toast(`Added ${qty} × ${p.name}`, "success");
        closeModal("restockModal");
        await fetchParts();
    } catch (err) {
        if (!err.offline) return toast(err.message, "error");
        queueOfflineRestock(p, qty);
        closeModal("restockModal");
        toast(`No internet — ${qty} × ${p.name} added on this phone. It will be sent automatically.`, "info");
    }
}

/* Add part -------------------------------------------------------- */
function openAddModal() {
    ["newName", "newSku", "newBarcode", "newQty", "newPrice", "newCost"].forEach(id => $(id).value = "");
    $("newMin").value = 5;
    openModal("addModal");
}
async function confirmAddPart() {
    const body = {
        name: $("newName").value.trim(),
        sku: $("newSku").value.trim(),
        barcode: $("newBarcode").value.trim(),
        qty: parseInt($("newQty").value || "0"),
        min: parseInt($("newMin").value || "5"),
        price: parseFloat($("newPrice").value),
        cost: parseFloat($("newCost").value || "0")
    };
    if (!body.name || !body.sku) return toast("Part name and SKU are needed", "error");
    if (!(body.price >= 0))      return toast("Enter the selling price", "error");
    if (!(body.qty >= 0) || !(body.min >= 0) || !(body.cost >= 0)) return toast("Numbers can't be negative", "error");
    if (body.cost > body.price && !confirm("The cost is higher than the selling price. Save anyway?")) return;
    try {
        await apiFetch("/parts", { method: "POST", body: JSON.stringify(body) });
        toast(`${body.name} added`, "success");
        closeModal("addModal");
        await fetchParts();
    } catch (err) { toast(err.message, "error"); }
}

/* Edit part ------------------------------------------------------- */
function openEditModal(id) {
    const p = state.parts.find(x => x.id === id);
    if (!p) return;
    state.editTargetId = id;
    $("editName").value = p.name;
    $("editSku").value = p.sku;
    $("editBarcode").value = p.barcode || "";
    $("editShopCode").textContent = p.barcode
        ? "Labels you print will use this barcode."
        : "No barcode? Labels you print will use a shop barcode the app makes for this part.";
    $("editPrice").value = p.price;
    $("editCost").value = p.cost || "";
    $("editMin").value = p.min;
    $("editQty").value = p.qty;
    $("editReason").value = "";
    openModal("editModal");
}
async function confirmEditPart() {
    const p = state.parts.find(x => x.id === state.editTargetId);
    if (!p) return;
    const body = {
        name: $("editName").value.trim(),
        sku: $("editSku").value.trim(),
        barcode: $("editBarcode").value.trim(),
        price: parseFloat($("editPrice").value),
        cost: parseFloat($("editCost").value || "0"),
        min: parseInt($("editMin").value)
    };
    const newQty = parseInt($("editQty").value);
    const reason = $("editReason").value.trim();
    if (!body.name || !body.sku) return toast("Part name and SKU are needed", "error");
    if (!(body.price >= 0) || !(body.cost >= 0) || !(body.min >= 0) || !(newQty >= 0)) return toast("Check the numbers — they can't be negative", "error");
    if (newQty !== p.qty && !reason) return toast("Say why the stock number changed", "error");
    try {
        await apiFetch(`/parts/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        if (newQty !== p.qty)
            await apiFetch(`/parts/${p.id}/adjust`, { method: "POST", body: JSON.stringify({ qty: newQty, reason }) });
        toast(`${body.name} saved`, "success");
        closeModal("editModal");
    } catch (err) { toast(err.message, "error"); }
    await fetchParts();
}

async function deletePart(id) {
    const p = state.parts.find(x => x.id === id);
    if (!p || !confirm(`Delete "${p.name}" from your stock list? This can't be undone.`)) return;
    try {
        await apiFetch(`/parts/${id}`, { method: "DELETE" });
        toast(`${p.name} deleted`, "info");
        await fetchParts();
    } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------
   SELLING
------------------------------------------------------------------ */
const cartQtyFor = id => state.cart.filter(c => c.part_id === id).reduce((s, c) => s + c.qty, 0);
const leftFor = p => p.qty - cartQtyFor(p.id);

function populateSaleDropdown() {
    const sel = $("salePart");
    const current = sel.value;
    sel.innerHTML = `<option value="">Choose a part…</option>` + state.parts.map(p => {
        const left = leftFor(p);
        return `<option value="${p.id}" ${left <= 0 ? "disabled" : ""} ${String(p.id) === current ? "selected" : ""}>${esc(p.name)} — ${naira(p.price)}${left <= 0 ? " (none left)" : ""}</option>`;
    }).join("");
    updateSalePreview();
}

function updateSalePreview() {
    const p = state.parts.find(x => x.id === parseInt($("salePart").value));
    const qty = parseInt($("saleQty").value);
    const box = $("salePreview");
    if (!p) { box.innerHTML = ""; return; }
    const left = leftFor(p);
    box.innerHTML = qty > left
        ? `<span class="warn">Only ${left} left in stock</span>`
        : `${left} left · ${qty > 0 ? `${qty} × ${money(p.price)} = <strong>${money(qty * p.price)}</strong>` : money(p.price) + " each"}`;
}

function addToCart() {
    const p = state.parts.find(x => x.id === parseInt($("salePart").value));
    const qty = parseInt($("saleQty").value);
    if (!p) return toast("Choose a part first", "error");
    if (!(qty > 0)) return toast("Enter a quantity", "error");
    if (qty > leftFor(p)) return toast(`Only ${leftFor(p)} ${p.name} left`, "error");
    addLine(p.id, qty);
    $("saleQty").value = 1;
    $("salePart").value = "";
    populateSaleDropdown();
}

function addLine(partId, qty) {
    const line = state.cart.find(c => c.part_id === partId);
    if (line) line.qty += qty; else state.cart.push({ part_id: partId, qty });
    renderCart();
}
function changeCartQty(partId, delta) {
    const line = state.cart.find(c => c.part_id === partId);
    const p = state.parts.find(x => x.id === partId);
    if (!line || !p) return;
    const next = line.qty + delta;
    if (next <= 0) return removeFromCart(partId);
    if (next > p.qty) return toast(`Only ${p.qty} ${p.name} in stock`, "error");
    line.qty = next;
    renderCart();
    populateSaleDropdown();
}
function removeFromCart(partId) {
    state.cart = state.cart.filter(c => c.part_id !== partId);
    renderCart();
    populateSaleDropdown();
}

function renderCart() {
    state.cart = state.cart.filter(c => state.parts.some(p => p.id === c.part_id));
    let total = 0;
    $("cartList").innerHTML = state.cart.length ? state.cart.map(c => {
        const p = state.parts.find(x => x.id === c.part_id);
        const line = c.qty * p.price;
        total += line;
        return `
        <div class="cart-line">
            <div class="cart-line-main"><strong>${esc(p.name)}</strong><span>${money(p.price)} each</span></div>
            <div class="stepper">
                <button onclick="changeCartQty(${p.id}, -1)" aria-label="One less">−</button>
                <span>${c.qty}</span>
                <button onclick="changeCartQty(${p.id}, 1)" aria-label="One more">+</button>
            </div>
            <div class="cart-line-total">${money(line)}</div>
        </div>`;
    }).join("") : `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i>&nbsp; Nothing added yet</div>`;
    $("cartTotal").innerHTML = money(total);
    $("completeSaleBtn").disabled = !state.cart.length;
}

function setPayMethod(m) {
    state.payMethod = m;
    document.querySelectorAll(".pay-btn").forEach(b => b.classList.toggle("active", b.dataset.method === m));
}

async function completeSale() {
    if (!state.cart.length) return;
    if (!state.payMethod) return toast("Choose how the customer paid: Cash, POS or Transfer", "error");
    const btn = $("completeSaleBtn");
    btn.disabled = true; btn.classList.add("loading");
    // One reference per sale: if the same sale is sent twice, the server saves it once
    const cust = saleCustomerFields();
    if (cust.error) { btn.disabled = false; btn.classList.remove("loading"); return toast(cust.error, "error"); }
    const body = {
        items: state.cart.map(c => ({ ...c })), ...cust,
        payment_method: state.payMethod, client_ref: newRef()
    };
    const clearSale = () => { state.cart = []; clearSaleCustomer(); setPayMethod(null); renderCart(); };
    try {
        const sale = await apiFetch("/sales", { method: "POST", body: JSON.stringify(body) });
        clearSale();
        toast(`Sale saved — ${naira(sale.total)}`, "success");
        if (body.new_customer) fetchCustomers();
        await fetchParts();
        loadSalesHistory();
        showReceipt(sale);
    } catch (err) {
        if (err.offline) {
            // No internet: keep the sale on this phone and send it as soon as the connection is back
            queueOfflineSale(body);
            clearSale();
            toast("No internet — sale kept on this phone. It will be sent automatically.", "info");
        } else {
            toast(err.message || "The sale didn't save — try again", "error");
            await fetchParts();
        }
    } finally {
        btn.classList.remove("loading");
        btn.disabled = !state.cart.length;
    }
}

/* Sales history ----------------------------------------------------- */
async function loadSalesHistory() {
    const dateEl = $("historyDate");
    if (!dateEl.value) dateEl.value = todayLocal();
    const tbody = $("salesHistoryBody");
    try {
        const { sales } = await apiFetch(`/sales?date=${dateEl.value}`);
        const kept = sales.filter(isLive);
        const total = kept.reduce((s, x) => s + x.total, 0);
        const voided = sales.length - kept.length;
        $("historySummary").innerHTML = `${dayName(dateEl.value)} · ${count(kept.length, "sale")} · ${money(total)}` +
            (voided ? ` · ${voided} cancelled` : "");
        tbody.innerHTML = sales.length ? sales.map(s => `
            <tr class="clickable ${isLive(s) ? "" : "voided"}" onclick="viewReceipt(${s.id})">
                <td class="card-title"><strong>${esc(s.customer || "Walk-in customer")}</strong> ${voidChip(s)}<div class="muted small">${receiptShort(s.receipt_no)}${s.sent_offline ? " · recorded offline" : ""}</div></td>
                <td data-label="Time">${fmtTime(s.created_at)}</td>
                <td data-label="Paid by">${esc(PAY_LABELS[s.payment_method] || "Cash")}</td>
                <td data-label="Served by">${esc(s.username)}</td>
                <td class="num" data-label="Total"><strong>${money(s.total)}</strong></td>
            </tr>`).join("")
            : `<tr><td class="empty-cell" colspan="5">No sales ${dayDiff(dateEl.value) === 0 ? "yet today" : "on this day"}.</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td class="empty-cell ${err.offline ? "" : "c-out"}" colspan="5">${esc(err.offline
            ? "No internet — the sales list will show when you're back online. You can still sell." : err.message)}</td></tr>`;
    }
}

/* ------------------------------------------------------------------
   OFFLINE SALES — kept on this phone, sent when the internet is back.
   Each has its own reference, so sending one twice never records it twice.
------------------------------------------------------------------ */
function newRef() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "s" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
function localStamp(d = new Date()) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// Kept per person (and per shop server in the installed app), so nothing is ever sent to the wrong account or shop
const pendingKey = () => `sp_pending_${IN_APP ? new URL(serverUrl()).host + "_" : ""}${(state.user?.username || "").toLowerCase()}`;
function getPending() {
    try { return JSON.parse(load(pendingKey()) || "[]"); } catch (_) { return []; }
}
function setPending(list) { store(pendingKey(), list.length ? JSON.stringify(list) : null); renderPending(); }

// Every action kept offline: { kind: "sale" | "restock" | "count", status: "pending" | "failed", ... }
const kindOf = op => op.kind || "sale";

function queueOfflineSale(body) {
    const lines = body.items.map(c => {
        const p = state.parts.find(x => x.id === c.part_id);
        return { ...c, name: p?.name || "Part", price: p?.price || 0 };
    });
    setPending([...getPending(), {
        kind: "sale", ...body, recorded_at: localStamp(), status: "pending",
        lines, total: lines.reduce((s, l) => s + l.qty * l.price, 0)
    }]);
    // Show the stock as already taken, so the same item isn't sold twice while offline
    for (const l of lines) { const p = state.parts.find(x => x.id === l.part_id); if (p) p.qty -= l.qty; }
    afterLocalChange();
}

function queueOfflineRestock(part, qty) {
    setPending([...getPending(), { kind: "restock", client_ref: newRef(), part_id: part.id, name: part.name,
                                   qty, recorded_at: localStamp(), status: "pending" }]);
    part.qty += qty;
    afterLocalChange();
}

// A counted number replaces any earlier unsent number for the same part in the same count
function queueOfflineCount(countId, part, counted) {
    const list = getPending().filter(o => !(kindOf(o) === "count" && o.count_id === countId && o.part_id === part.id && o.status === "pending"));
    list.push({ kind: "count", client_ref: newRef(), count_id: countId, part_id: part.id, name: part.name,
                counted, recorded_at: localStamp(), status: "pending" });
    setPending(list);
}

function afterLocalChange() {
    store("sp_parts_cache", JSON.stringify(state.parts));
    renderAll();
}

// What the server doesn't know yet, applied on top of the stock list it sends
function applyPendingToParts(parts) {
    for (const op of getPending()) {
        if (kindOf(op) === "sale") for (const l of op.lines || []) {
            const p = parts.find(x => x.id === l.part_id); if (p) p.qty -= l.qty;
        }
        if (kindOf(op) === "restock" && op.status === "pending") {
            const p = parts.find(x => x.id === op.part_id); if (p) p.qty += op.qty;
        }
    }
}

let syncing = false;
async function syncPending() {
    if (syncing || !state.token || !state.user) return;
    const list = getPending();
    if (!list.some(s => s.status === "pending")) return;
    syncing = true;
    const sent = { sale: 0, restock: 0, count: 0 };
    try {
        for (const op of list) {                         // oldest first, so things arrive in the order they happened
            if (op.status !== "pending") continue;
            const k = kindOf(op);
            try {
                if (k === "sale")
                    await apiFetch("/sales", { method: "POST", body: JSON.stringify({
                        items: op.items, customer: op.customer, customer_id: op.customer_id, new_customer: op.new_customer,
                        payment_method: op.payment_method, client_ref: op.client_ref, recorded_at: op.recorded_at }) });
                else if (k === "restock")
                    await apiFetch(`/parts/${op.part_id}/restock`, { method: "POST", body: JSON.stringify({
                        qty: op.qty, client_ref: op.client_ref, recorded_at: op.recorded_at }) });
                else if (k === "count") {
                    const c = await apiFetch(`/counts/${op.count_id}/lines`, { method: "PUT",
                        body: JSON.stringify({ part_id: op.part_id, counted: op.counted }) });
                    if (state.count?.id === c.id) state.count = c;
                }
                op.status = "sent"; sent[k]++;
            } catch (err) {
                if (err.offline) break;                 // still no internet — try again later
                op.status = "failed"; op.error = err.message;
            }
        }
    } finally {
        setPending(list.filter(s => s.status !== "sent"));
        syncing = false;
    }
    const parts = [sent.sale && count(sent.sale, "sale"), sent.restock && count(sent.restock, "restock"),
                   sent.count && count(sent.count, "counted part")].filter(Boolean);
    if (parts.length) {
        toast(`Back online — ${parts.join(", ")} sent`, "success");
        await fetchParts();
        if ($("sales").classList.contains("active")) loadSalesHistory();
        if ($("dashboard").classList.contains("active")) loadTodaySummary();
        if ($("counts").classList.contains("active")) loadCounts();
    }
}

function dismissFailedSale(ref) {
    if (!confirm("Remove this from the phone? Make sure the owner knows about it first.")) return;
    setPending(getPending().filter(s => s.client_ref !== ref));
    fetchParts();
}

function renderPending() {
    const list = state.user ? getPending() : [];
    const waiting = list.filter(s => s.status === "pending");
    const failed  = list.filter(s => s.status === "failed");
    const sales = waiting.filter(o => kindOf(o) === "sale"), restocks = waiting.filter(o => kindOf(o) === "restock"),
          counts = waiting.filter(o => kindOf(o) === "count");
    const what = [
        sales.length && `${count(sales.length, "sale")} (${money(sales.reduce((t, s) => t + s.total, 0))})`,
        restocks.length && count(restocks.length, "restock"),
        counts.length && count(counts.length, "counted part")
    ].filter(Boolean).join(", ");
    const describe = o => kindOf(o) === "sale"
        ? `sale of ${naira(o.total)}: ${o.lines.map(l => `${l.name} × ${l.qty}`).join(", ")}`
        : kindOf(o) === "restock" ? `${o.qty} × ${o.name} added to stock` : `count of ${o.name} (${o.counted})`;
    const html = !list.length ? "" : `
        ${waiting.length ? `<div class="notice warn pending-note"><i class="fa-solid fa-cloud-arrow-up"></i>
            <div><strong>${what} waiting to be sent.</strong>
            Recorded without internet — they'll be sent automatically when the connection is back.</div>
            <button class="btn btn-soft btn-sm" onclick="syncPending()"><i class="fa-solid fa-rotate"></i> Send now</button></div>` : ""}
        ${failed.map(s => `<div class="notice alert pending-note"><i class="fa-solid fa-triangle-exclamation"></i>
            <div><strong>Something recorded offline couldn't be saved</strong> (${esc(fmtWhen(s.recorded_at))}, ${esc(describe(s))}).<br>
            Reason: ${esc(s.error)}. Tell the owner so the stock can be checked.</div>
            <button class="btn btn-ghost btn-sm" onclick="dismissFailedSale('${esc(s.client_ref)}')">Remove</button></div>`).join("")}`;
    document.querySelectorAll(".pending-box").forEach(el => el.innerHTML = html);
}
window.addEventListener("online", () => syncPending());
setInterval(() => { if (navigator.onLine !== false) syncPending(); }, 30000);

/* ------------------------------------------------------------------
   RECEIPTS — carry the shop's own name, address and phone
------------------------------------------------------------------ */
async function viewReceipt(id) {
    try { showReceipt(await apiFetch(`/sales/${id}`)); }
    catch (err) { toast(err.message, "error"); }
}

function showReceipt(sale) {
    state.lastReceipt = sale;
    const s = state.shop;
    $("receiptBody").innerHTML = `
        <div class="rc-head">
            <strong>${esc(shopName())}</strong>
            ${s.address ? `<span>${esc(s.address)}</span>` : ""}
            ${s.phone ? `<span>${esc(s.phone)}</span>` : ""}
        </div>
        <div class="rc-meta">
            <div><span>Receipt</span><strong>${receiptShort(sale.receipt_no)}</strong></div>
            <div><span>Date</span><strong>${fmtDate(sale.created_at, { year: true })}, ${fmtTime(sale.created_at)}</strong></div>
            ${sale.customer ? `<div><span>Customer</span><strong>${esc(sale.customer)}</strong></div>` : ""}
            <div><span>Paid by</span><strong>${esc(PAY_LABELS[sale.payment_method] || "Cash")}</strong></div>
            <div><span>Served by</span><strong>${esc(sale.username)}</strong></div>
        </div>
        <table class="rc-items">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
            <tbody>${sale.items.map(i => `
                <tr><td>${esc(i.part_name)}</td><td>${i.qty}</td><td>${naira(i.unit_price)}</td><td>${naira(i.line_total)}</td></tr>`).join("")}
            </tbody>
        </table>
        <div class="rc-total"><span>Total</span><strong>${naira(sale.total)}</strong></div>
        <div class="rc-foot">${esc(s.receipt_note || "Thank you for your patronage")}</div>
        <div class="rc-ref">${esc(sale.receipt_no)}</div>
        ${isLive(sale) ? "" : `<div class="rc-void"><strong>${sale.void_type === "return" ? "RETURNED" : "CANCELLED"}</strong>
            by ${esc(sale.voided_by)} · ${fmtWhen(sale.voided_at)}<br>${esc(sale.void_reason)}</div>`}`;
    $("voidSaleBtn").hidden = !(isAdmin() && isLive(sale));
    updateReceiptButtons(sale);
    openModal("receiptModal");
}

/* Cancel / return a sale (owner) — the sale stays on record, the parts go back into stock */
function openVoidModal() {
    const r = state.lastReceipt;
    if (!r) return;
    $("voidSaleInfo").textContent = `Receipt ${receiptShort(r.receipt_no)} · ${naira(r.total)} · sold by ${r.username}`;
    $("voidReason").value = "";
    document.querySelector('input[name="voidType"][value="cancel"]').checked = true;
    openModal("voidModal");
}
async function confirmVoidSale() {
    const r = state.lastReceipt;
    const reason = $("voidReason").value.trim();
    if (!reason) return toast("Say why, so the record makes sense later", "error");
    const type = document.querySelector('input[name="voidType"]:checked').value;
    try {
        const sale = await apiFetch(`/sales/${r.id}/void`, { method: "POST", body: JSON.stringify({ type, reason }) });
        closeModal("voidModal");
        toast(type === "return" ? "Return recorded — parts are back in stock" : "Sale cancelled — parts are back in stock", "success");
        showReceipt(sale);
        await fetchParts();
        loadSalesHistory();
        if ($("dashboard").classList.contains("active")) loadTodaySummary();
    } catch (err) { toast(err.message, "error"); }
}

function printReceipt() {
    document.body.classList.add("printing-receipt");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-receipt"), 500);
}


/* ------------------------------------------------------------------
   CUSTOMERS — profiles with phone / email, so receipts and a customer's
   purchase history can be sent to them in one tap (WhatsApp or email).
------------------------------------------------------------------ */
state.customers = [];
state.saleCustomer = null;      // { id, name, phone, email } existing · { isNew: true, name } new · null walk-in

const custCacheKey = () => pendingKey().replace("sp_pending_", "sp_customers_");

// Same rules as the server: Nigerian numbers in any usual form → +2348031234567
function normalizePhone(v) {
    const raw = String(v || "").trim();
    if (!raw) return "";
    if (!/^[\d\s+().-]+$/.test(raw)) return null;            // letters or other symbols: not a phone number
    const d = raw.replace(/[^\d+]/g, "");
    if (/^\+234[1-9]\d{9}$/.test(d)) return d;
    if (/^234[1-9]\d{9}$/.test(d)) return "+" + d;
    if (/^0[1-9]\d{9}$/.test(d)) return "+234" + d.slice(1);
    if (/^[789]\d{9}$/.test(d)) return "+234" + d;
    if (/^\+[1-9]\d{7,14}$/.test(d)) return d;
    return null;     // doesn't look like a phone number
}
const validEmail = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function showPhone(p) {                 // +2348031234567 → 0803 123 4567
    if (!p) return "";
    const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(p);
    return m ? `0${m[1]} ${m[2]} ${m[3]}` : p;
}

async function fetchCustomers() {
    try {
        state.customers = await apiFetch("/customers");
        store(custCacheKey(), JSON.stringify(state.customers));
    } catch (err) {
        if (!state.customers.length) try { state.customers = JSON.parse(load(custCacheKey()) || "[]"); } catch (_) {}
    }
    return state.customers;
}

function matchCustomers(q) {
    q = q.trim().toLowerCase();
    if (!q) return state.customers.slice(0, 6);
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    return state.customers.filter(c => c.name.toLowerCase().includes(q) || (c.email || "").includes(q) ||
        (digits.length >= 3 && (c.phone || "").includes(digits))).slice(0, 8);
}

/* Customer box on the Sell screen ---------------------------------- */
function onCustomerSearch() {
    const q = $("saleCustomer").value;
    const box = $("custResults");
    const found = matchCustomers(q);
    const typed = q.trim();
    const exact = found.some(c => c.name.toLowerCase() === typed.toLowerCase());
    box.innerHTML = found.map(c => `
        <button type="button" class="cust-opt" onmousedown="event.preventDefault()" onclick="pickCustomer(${c.id})">
            <strong>${esc(c.name)}</strong><span>${esc(showPhone(c.phone) || c.email || "no phone or email")}${c.visits ? ` · ${count(c.visits, "visit")}` : ""}</span>
        </button>`).join("") +
        (typed && !exact ? `<button type="button" class="cust-opt new" onmousedown="event.preventDefault()" onclick="pickNewCustomer()">
            <strong><i class="fa-solid fa-user-plus"></i> New customer: ${esc(typed)}</strong><span>add phone / email to send the receipt</span></button>` : "");
    box.hidden = !box.innerHTML.trim();
}
function onCustomerKey(e) {
    if (e.key === "Escape") $("custResults").hidden = true;
    if (e.key === "Enter") { e.preventDefault(); const first = $("custResults").querySelector(".cust-opt"); if (first) first.click(); }
}
document.addEventListener("click", e => {
    if (!e.target.closest?.("#custSearchWrap")) { const b = $("custResults"); if (b) b.hidden = true; }
});

function pickCustomer(id) {
    const c = state.customers.find(x => x.id === id);
    if (!c) return;
    state.saleCustomer = { id: c.id, name: c.name, phone: c.phone, email: c.email };
    renderSaleCustomer();
}
function pickNewCustomer() {
    const name = $("saleCustomer").value.trim();
    if (!name) return;
    state.saleCustomer = { isNew: true, name };
    renderSaleCustomer();
    $("newCustPhone").focus();
}
function clearSaleCustomer() {
    state.saleCustomer = null;
    $("saleCustomer").value = ""; $("newCustPhone").value = ""; $("newCustEmail").value = ""; $("newCustConsent").checked = true;
    renderSaleCustomer();
}
function renderSaleCustomer() {
    const c = state.saleCustomer;
    $("custResults").hidden = true;
    $("custSearchWrap").hidden = !!c;
    $("custNewFields").hidden = !(c && c.isNew);
    $("custPicked").hidden = !c;
    if (c) $("custPicked").innerHTML = `
        <div class="avatar sm">${esc(c.name.charAt(0).toUpperCase())}</div>
        <div class="cust-picked-main"><strong>${esc(c.name)}</strong>
            <span>${c.isNew ? "New customer" : esc(showPhone(c.phone) || c.email || "No phone or email saved")}</span></div>
        <button class="btn btn-ghost btn-sm" onclick="clearSaleCustomer()" title="Remove"><i class="fa-solid fa-xmark"></i></button>`;
}

// What the sale sends about the customer. Returns { error } if a typed phone/email is wrong.
function saleCustomerFields() {
    const c = state.saleCustomer;
    if (!c) return { customer: $("saleCustomer").value.trim() };     // just a name typed, or walk-in
    if (!c.isNew) return { customer: c.name, customer_id: c.id };
    const phone = normalizePhone($("newCustPhone").value);
    const email = $("newCustEmail").value.trim().toLowerCase();
    if (phone === null) return { error: "That phone number doesn't look right (e.g. 0803 123 4567)" };
    if (!validEmail(email)) return { error: "That email address doesn't look right" };
    if (!phone && !email) return { customer: c.name };              // name only: no profile needed
    return { customer: c.name, new_customer: { name: c.name, phone, email, consent: $("newCustConsent").checked } };
}

/* Sending receipts ---------------------------------------------------- */
// WhatsApp and email open in the phone's / computer's own apps, from the shop's own account: free.
function openLink(url) {
    if (url.startsWith("mailto:") || IN_APP) location.href = url;
    else window.open(url, "_blank");
}
function receiptText(r, plain = false) {
    const s = state.shop, b = t => plain ? t : `*${t}*`;
    return [
        isLive(r) ? null : b(r.void_type === "return" ? "RETURNED" : "CANCELLED"),
        b(shopName()), s.address || null, s.phone || null, "",
        `Receipt ${receiptShort(r.receipt_no)} · ${fmtDate(r.created_at, { year: true })}, ${fmtTime(r.created_at)}`,
        r.customer ? `Customer: ${r.customer}` : null, "",
        ...r.items.map(i => `${i.part_name} × ${i.qty} — ${naira(i.line_total)}`), "",
        `${b("Total: " + naira(r.total))} (${PAY_LABELS[r.payment_method] || "Cash"})`,
        s.receipt_note || "Thank you for your patronage",
        `Ref: ${r.receipt_no}`
    ].filter(l => l !== null).join("\n");
}
function logSent(customerId, channel, what) {
    if (customerId) apiFetch(`/customers/${customerId}/sent`, { method: "POST", body: JSON.stringify({ channel, what }) }).catch(() => {});
}

function shareReceipt() {
    const r = state.lastReceipt;
    if (!r) return;
    const text = receiptText(r), phone = r.customer_info?.phone;
    if (phone) {
        openLink(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`);
        logSent(r.customer_info.id, "whatsapp", `Receipt ${receiptShort(r.receipt_no)}`);
    } else if (navigator.share) navigator.share({ title: `Receipt ${receiptShort(r.receipt_no)}`, text }).catch(() => {});
    else openLink(`https://wa.me/?text=${encodeURIComponent(text)}`);
}
function emailReceipt() {
    const r = state.lastReceipt, email = r?.customer_info?.email;
    if (!email) return;
    const subject = `Receipt ${receiptShort(r.receipt_no)} from ${shopName()}`;
    openLink(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(receiptText(r, true))}`);
    logSent(r.customer_info.id, "email", `Receipt ${receiptShort(r.receipt_no)}`);
}
function updateReceiptButtons(r) {
    const ci = r.customer_info;
    $("shareReceiptBtn").querySelector("span").textContent = ci?.phone ? `WhatsApp ${ci.name.split(" ")[0]}` : "Share";
    $("emailReceiptBtn").hidden = !ci?.email;
}

/* Customers screen ---------------------------------------------------- */
async function loadCustomers() {
    $("customerTableBody").innerHTML = `<tr><td class="empty-cell" colspan="5">Loading…</td></tr>`;
    await fetchCustomers();
    renderCustomers();
}
function renderCustomers() {
    const q = ($("customerSearch")?.value || "").trim().toLowerCase();
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    const list = !q ? state.customers : state.customers.filter(c => c.name.toLowerCase().includes(q) ||
        (c.email || "").includes(q) || (digits.length >= 3 && (c.phone || "").includes(digits)));
    $("customerTableBody").innerHTML = list.length ? list.map(c => `
        <tr class="clickable" onclick="openCustomer(${c.id})">
            <td class="card-title"><strong>${esc(c.name)}</strong>${c.email ? `<div class="muted small">${esc(c.email)}</div>` : ""}</td>
            <td data-label="Phone">${esc(showPhone(c.phone)) || `<span class="muted">—</span>`}</td>
            <td class="num" data-label="Visits">${c.visits || 0}</td>
            <td class="num" data-label="Spent">${money(c.spent || 0)}</td>
            <td data-label="Last visit">${c.last_visit ? fmtWhen(c.last_visit) : `<span class="muted">—</span>`}</td>
        </tr>`).join("")
        : `<tr><td class="empty-cell" colspan="5">${q ? "No customer matches." : "No customers yet. Add one here, or when you make a sale."}</td></tr>`;
}

async function openCustomer(id) {
    try {
        const c = await apiFetch(`/customers/${id}`);
        state.openCustomer = c;
        const done = c.sales.filter(isLive);
        $("customerModalBody").innerHTML = `
            <h3><i class="fa-solid fa-user"></i> ${esc(c.name)}</h3>
            <p class="modal-sub">${[c.phone && `<i class="fa-brands fa-whatsapp"></i> ${esc(showPhone(c.phone))}`, c.email && `<i class="fa-solid fa-envelope"></i> ${esc(c.email)}`]
                .filter(Boolean).join(" &nbsp;·&nbsp; ") || "No phone or email saved"}${c.consent ? "" : (c.phone || c.email ? ` <span class="pill low small-pill">no consent to messages</span>` : "")}</p>
            ${c.note ? `<p class="small" style="margin-bottom:10px;">${esc(c.note)}</p>` : ""}
            <div class="mini-stats" style="margin-bottom:14px;">
                <span><strong>${c.visits}</strong> ${c.visits === 1 ? "visit" : "visits"}</span>
                <span><strong>${money(c.spent)}</strong> spent</span>
                <span>${c.last_visit ? `last: <strong>${fmtWhen(c.last_visit)}</strong>` : "no purchases yet"}</span>
            </div>
            <div class="table-wrap" style="max-height:340px;overflow:auto;margin-bottom:14px;"><table class="table">
                <thead><tr><th>Receipt</th><th>Items</th><th class="num">Total</th></tr></thead>
                <tbody>${c.sales.length ? c.sales.map(s => `
                    <tr class="clickable ${isLive(s) ? "" : "voided"}" onclick="closeModal('customerModal');viewReceipt(${s.id})">
                        <td class="card-title"><strong>${receiptShort(s.receipt_no)}</strong> ${voidChip(s)}<div class="muted small">${fmtWhen(s.created_at)} · ${esc(PAY_LABELS[s.payment_method] || "Cash")}</div></td>
                        <td data-label="Items" class="small">${esc(s.items.map(i => `${i.part_name} × ${i.qty}`).join(", "))}</td>
                        <td class="num" data-label="Total"><strong>${money(s.total)}</strong></td>
                    </tr>`).join("") : `<tr><td class="empty-cell" colspan="3">No purchases yet.</td></tr>`}</tbody>
            </table></div>
            <div class="modal-actions">
                ${isAdmin() ? `<button class="btn btn-ghost" onclick="deleteCustomer(${c.id})" title="Remove contact details; sales are kept">Forget</button>` : ""}
                <button class="btn btn-secondary" onclick="openCustomerEdit(state.openCustomer)"><i class="fa-solid fa-pen"></i> Edit</button>
                ${c.email && done.length ? `<button class="btn btn-secondary" onclick="sendStatement('email')"><i class="fa-solid fa-envelope"></i> Email history</button>` : ""}
                ${c.phone && done.length ? `<button class="btn btn-primary" onclick="sendStatement('whatsapp')"><i class="fa-brands fa-whatsapp"></i> WhatsApp history</button>` : ""}
                <button class="btn btn-secondary" onclick="closeModal('customerModal')">Close</button>
            </div>`;
        openModal("customerModal");
    } catch (err) { toast(err.offline ? "No internet — customer history needs a connection" : err.message, "error"); }
}

// The customer's chain of purchases, newest first, ready to send
function statementText(c, plain) {
    const b = t => plain ? t : `*${t}*`, done = c.sales.filter(isLive);
    const lines = [], MAX = 15;
    for (const s of done.slice(0, MAX))
        lines.push(`${fmtDate(s.created_at, { year: true })} · ${receiptShort(s.receipt_no)} · ${naira(s.total)}\n   ${s.items.map(i => `${i.part_name} × ${i.qty}`).join(", ")}`);
    if (done.length > MAX) lines.push(`…and ${count(done.length - MAX, "earlier purchase")}`);
    return [
        b(shopName()), state.shop.phone || null, "",
        b(`Purchase history for ${c.name}`), "",
        ...lines, "",
        b(`Total: ${naira(c.spent)} over ${count(c.visits, "visit")}`),
        "Thank you for buying from us."
    ].filter(l => l !== null).join("\n");
}
function sendStatement(channel) {
    const c = state.openCustomer;
    if (!c) return;
    if (channel === "email")
        openLink(`mailto:${c.email}?subject=${encodeURIComponent(`Your purchases at ${shopName()}`)}&body=${encodeURIComponent(statementText(c, true))}`);
    else openLink(`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(statementText(c))}`);
    logSent(c.id, channel, "Purchase history");
}

let editingCustomerId = null;
function openCustomerEdit(c = null) {
    editingCustomerId = c ? c.id : null;
    $("custEditTitle").textContent = c ? "Edit customer" : "Add customer";
    $("custEditName").value = c?.name || "";
    $("custEditPhone").value = showPhone(c?.phone) || "";
    $("custEditEmail").value = c?.email || "";
    $("custEditNote").value = c?.note || "";
    $("custEditConsent").checked = c ? !!c.consent : true;
    if (c) closeModal("customerModal");
    openModal("customerEditModal");
    setTimeout(() => $("custEditName").focus(), 30);
}
async function saveCustomerEdit() {
    const phone = normalizePhone($("custEditPhone").value), email = $("custEditEmail").value.trim().toLowerCase();
    if (!$("custEditName").value.trim()) return toast("Enter the customer's name", "error");
    if (phone === null) return toast("That phone number doesn't look right (e.g. 0803 123 4567)", "error");
    if (!validEmail(email)) return toast("That email address doesn't look right", "error");
    const body = { name: $("custEditName").value.trim(), phone, email, note: $("custEditNote").value.trim(), consent: $("custEditConsent").checked };
    try {
        const c = await apiFetch(editingCustomerId ? `/customers/${editingCustomerId}` : "/customers",
                                 { method: editingCustomerId ? "PUT" : "POST", body: JSON.stringify(body) });
        closeModal("customerEditModal");
        toast(editingCustomerId ? "Customer updated" : "Customer added", "success");
        await fetchCustomers();
        if ($("customers").classList.contains("active")) renderCustomers();
        if (editingCustomerId) openCustomer(c.id);
    } catch (err) { toast(err.offline ? "No internet — add the customer when you're online, or add them during a sale" : err.message, "error"); }
}
async function deleteCustomer(id) {
    if (!confirm("Forget this customer's phone and email? Their past sales stay on record with their name.")) return;
    try {
        await apiFetch(`/customers/${id}`, { method: "DELETE" });
        closeModal("customerModal");
        toast("Customer's contact details removed", "success");
        loadCustomers();
    } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------
   STOCK COUNT — staff count the shelf, the owner reviews differences.
   Scans here only add to the count; they never sell or change stock.
------------------------------------------------------------------ */
state.count = null;          // my open count, with lines
state.countSearch = "";

const COUNT_STATUS = {
    open:      ["Counting", "plain"],
    submitted: ["Waiting for owner", "low"],
    approved:  ["Reviewed", "ok"],
    rejected:  ["Set aside", "out"]
};
const countPill = c => { const [t, cls] = COUNT_STATUS[c.status] || [c.status, "plain"]; return `<span class="pill ${cls}">${t}</span>`; };
const diffText = d => d === 0 ? `<span class="muted">matches</span>`
    : `<span class="count-row-diff ${d > 0 ? "diff-pos" : "diff-neg"}">${d > 0 ? "+" : ""}${d}</span>`;

async function loadCounts() {
    const out = $("countBody");
    try {
        const list = await apiFetch("/counts");
        updateCountBadge(list);
        const mine = list.find(c => c.status === "open" && c.user_id === state.user.id);
        state.count = mine ? await apiFetch(`/counts/${mine.id}`) : null;
        // Numbers counted offline and not yet sent still show as counted
        if (state.count) for (const op of getPending()) {
            if (kindOf(op) !== "count" || op.count_id !== state.count.id || op.status !== "pending") continue;
            const part = state.parts.find(p => p.id === op.part_id);
            const old = state.count.lines.find(l => l.part_id === op.part_id);
            state.count.lines = state.count.lines.filter(l => l.part_id !== op.part_id);
            if (op.counted !== null) {
                const expected = old ? old.expected : Math.max(part?.qty ?? 0, 0);
                state.count.lines.push({ part_id: op.part_id, part_name: op.name, sku: part?.sku, expected, counted: op.counted, difference: op.counted - expected });
            }
        }
        store(countCacheKey(), state.count ? JSON.stringify(state.count) : null);
        const waiting = isAdmin() ? list.filter(c => c.status === "submitted") : [];
        const history = list.filter(c => c !== mine && !waiting.includes(c)).slice(0, 10);

        out.innerHTML = `
            ${waiting.length ? `<div class="section-title">Waiting for your review</div>
                <div class="list">${waiting.map(c => `
                    <div class="list-row clickable" onclick="openCountReview(${c.id})">
                        <div class="list-icon" style="background:var(--low-bg);color:var(--low)"><i class="fa-solid fa-clipboard-list"></i></div>
                        <div class="list-main"><strong>Count #${c.id} by ${esc(c.username)}</strong>
                            <div class="muted">${esc(c.note || "")}${c.note ? " · " : ""}${count(c.lines, "part")} counted · ${count(c.differences, "difference")}</div></div>
                        <button class="btn btn-primary btn-sm">Review</button>
                    </div>`).join("")}</div>` : ""}
            <div id="countWork">${state.count ? renderCountWork() : renderCountStart()}</div>
            ${history.length ? `<div class="section-title">Earlier counts</div>
                <div class="list">${history.map(c => `
                    <div class="list-row ${isAdmin() || c.status !== "open" ? "clickable" : ""}" onclick="openCountReview(${c.id})">
                        <div class="list-icon"><i class="fa-solid fa-clipboard-check"></i></div>
                        <div class="list-main"><strong>Count #${c.id}${isAdmin() ? " by " + esc(c.username) : ""}</strong>
                            <div class="muted">${fmtWhen(c.created_at)} · ${count(c.lines, "part")} · ${count(c.differences, "difference")}${c.review_note ? " · " + esc(c.review_note) : ""}</div></div>
                        ${countPill(c)}
                    </div>`).join("")}</div>` : ""}`;
        if (state.count) setTimeout(() => $("countScanInput")?.focus(), 50);
    } catch (err) {
        if (err.offline && !state.count) {
            try { state.count = JSON.parse(load(countCacheKey()) || "null"); } catch (_) {}
        }
        if (err.offline && state.count) {
            // Offline in the middle of a count: carry on with what this phone has
            out.innerHTML = `<div class="notice warn"><i class="fa-solid fa-wifi"></i><div>No internet. You can keep counting —
                the numbers stay on this phone and are sent when you're back online.</div></div><div id="countWork">${renderCountWork()}</div>`;
            return;
        }
        out.innerHTML = `<div class="notice alert"><i class="fa-solid fa-circle-exclamation"></i><div>${esc(err.offline
            ? "No internet. Start a count when you're online; after that you can keep counting offline." : err.message)}</div></div>`;
    }
}

const countCacheKey = () => pendingKey().replace("sp_pending_", "sp_count_");

function updateCountBadge(list) {
    const n = isAdmin() ? list.filter(c => c.status === "submitted").length : 0;
    const b = $("countBadge");
    if (b) { b.hidden = !n; b.textContent = n; }
}

function renderCountStart() {
    return `
    <div class="card">
        <h3><i class="fa-solid fa-clipboard-check"></i> Start a stock count</h3>
        <p class="muted small" style="margin-bottom:14px;">Go shelf by shelf. Scan each item (every beep adds one) or type the number you see.
           Nothing in stock changes until the owner looks at the differences and approves them.</p>
        <div class="form-row"><label class="field-label" for="countNote">What are you counting? <span class="muted">(optional)</span></label>
            <input id="countNote" maxlength="120" placeholder="e.g. Shelf A, brake parts, whole shop"></div>
        <button class="btn btn-primary" onclick="startCount()"><i class="fa-solid fa-play"></i> Start counting</button>
    </div>`;
}

function renderCountWork() {
    const c = state.count;
    const byPart = new Map(c.lines.map(l => [l.part_id, l]));
    const q = state.countSearch.toLowerCase();
    const parts = state.parts.filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q));
    const diffs = c.lines.filter(l => l.difference !== 0).length;
    return `
    <div class="card">
        <div class="count-head">
            <h3><i class="fa-solid fa-clipboard-list"></i> Count #${c.id}${c.note ? " · " + esc(c.note) : ""}</h3>
            <div class="mini-stats"><span><strong>${c.lines.length}</strong> of ${state.parts.length} parts counted</span>
                <span><strong>${diffs}</strong> ${diffs === 1 ? "difference" : "differences"}</span></div>
        </div>
        <div class="scan-row">
            <div class="input-icon"><i class="fa-solid fa-barcode"></i>
                <input class="input" id="countScanInput" placeholder="Scan or type barcode / SKU — adds 1" autocomplete="off" onkeydown="handleCountScanInput(event)"></div>
            <button class="btn btn-soft" onclick="openScanner('count')" title="Scan with camera"><i class="fa-solid fa-camera"></i><span class="hide-sm">Camera</span></button>
        </div>
        <div class="toolbar" style="margin-top:12px;">
            <div class="search"><i class="fa-solid fa-magnifying-glass"></i>
                <input class="input" type="search" placeholder="Find a part" value="${esc(state.countSearch)}" oninput="state.countSearch=this.value;refreshCountTable()"></div>
        </div>
        <div class="table-wrap"><table class="table">
            <thead><tr><th>Part</th><th class="num">App says</th><th class="num">You counted</th><th class="num">Difference</th></tr></thead>
            <tbody id="countTableBody">${countRows(parts, byPart)}</tbody>
        </table></div>
        <div class="toolbar" style="justify-content:flex-end;margin:16px 0 0;">
            <span class="muted small">Leave a box empty if you didn't count that part.</span>
            ${isAdmin()
                ? `<button class="btn btn-primary" onclick="openCountReview(${c.id})" ${c.lines.length ? "" : "disabled"}><i class="fa-solid fa-check"></i> Finish &amp; review</button>`
                : `<button class="btn btn-primary" onclick="submitCount()" ${c.lines.length ? "" : "disabled"}><i class="fa-solid fa-paper-plane"></i> Send to owner</button>`}
        </div>
    </div>`;
}

function countRows(parts, byPart) {
    return parts.length ? parts.map(p => {
        const l = byPart.get(p.id);
        return `
        <tr class="${l ? "counted" : ""}">
            <td class="card-title"><div class="part-name">${esc(p.name)}</div><div class="part-sub code">${esc(p.sku)}</div></td>
            <td class="num" data-label="App says">${l ? l.expected : Math.max(p.qty, 0)}</td>
            <td class="num" data-label="You counted"><input class="input count-input" type="number" min="0" inputmode="numeric"
                value="${l ? l.counted : ""}" placeholder="—" onchange="setCountLine(${p.id}, this.value)"></td>
            <td class="num" data-label="Difference">${l ? diffText(l.difference) : ""}</td>
        </tr>`;
    }).join("") : `<tr><td class="empty-cell" colspan="4">No parts match.</td></tr>`;
}

function refreshCountTable() {
    if (!state.count) return;
    $("countWork").innerHTML = renderCountWork();
    const s = document.querySelector("#countWork .search input");
    if (s && state.countSearch) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

async function startCount() {
    try {
        state.count = await apiFetch("/counts", { method: "POST", body: JSON.stringify({ note: $("countNote")?.value.trim() || "" }) });
        loadCounts();
    } catch (err) { toast(err.message, "error"); }
}

async function setCountLine(partId, value, quiet = false) {
    if (!state.count) return;
    const v = String(value).trim();
    try {
        state.count = await apiFetch(`/counts/${state.count.id}/lines`, {
            method: "PUT", body: JSON.stringify({ part_id: partId, counted: v === "" ? null : Number(v) }) });
        store(countCacheKey(), JSON.stringify(state.count));
        if (!quiet) refreshCountTable();
        return true;
    } catch (err) {
        if (!err.offline) { toast(err.message, "error"); return false; }
        // No internet: keep the number on this phone and update the screen; it's sent when the connection is back
        const part = state.parts.find(p => p.id === partId);
        if (!part) return false;
        queueOfflineCount(state.count.id, part, v === "" ? null : Number(v));
        const lines = state.count.lines.filter(l => l.part_id !== partId);
        if (v !== "") {
            const old = state.count.lines.find(l => l.part_id === partId);
            const expected = old ? old.expected : Math.max(part.qty, 0);
            lines.push({ part_id: partId, part_name: part.name, sku: part.sku, expected, counted: Number(v), difference: Number(v) - expected });
        }
        state.count = { ...state.count, lines };
        store(countCacheKey(), JSON.stringify(state.count));
        if (!quiet) refreshCountTable();
        return true;
    }
}

function handleCountScanInput(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addCountByCode(e.target.value);
    e.target.value = "";
}

async function addCountByCode(code) {
    const p = findPartByCode(code);
    if (!p) {
        beep(false);
        toast("This code isn't on any part yet, so it wasn't counted. The owner can add it with Edit in Stock.", "error");
        return false;
    }
    const line = state.count?.lines.find(l => l.part_id === p.id);
    const ok = await setCountLine(p.id, (line ? line.counted : 0) + 1, true);
    if (ok) {
        beep(true);
        const now = state.count.lines.find(l => l.part_id === p.id);
        toast(`${p.name}: ${now.counted} counted`, "success");
        refreshCountTable();
        setTimeout(() => $("countScanInput")?.focus(), 30);
    }
    return ok;
}

async function submitCount() {
    if (!state.count) return;
    if (getPending().some(o => kindOf(o) === "count" && o.count_id === state.count.id && o.status === "pending"))
        return toast("Some counted parts are still on this phone. Connect to the internet, press Send now, then send the count.", "error");
    if (!confirm(`Send count #${state.count.id} to the owner? You won't be able to change it after.`)) return;
    try {
        await apiFetch(`/counts/${state.count.id}/submit`, { method: "POST" });
        toast("Sent to the owner for review", "success");
        state.count = null;
        loadCounts();
    } catch (err) { toast(err.message, "error"); }
}

/* Owner review: tick the differences to correct, add a note, approve — or set the count aside */
async function openCountReview(id) {
    try {
        const c = await apiFetch(`/counts/${id}`);
        const reviewable = isAdmin() && (c.status === "submitted" || (c.status === "open" && c.user_id === state.user.id));
        const diffs = c.lines.filter(l => l.difference !== 0);
        const matched = c.lines.length - diffs.length;
        $("countReviewBody").innerHTML = `
            <h3><i class="fa-solid fa-clipboard-check"></i> Count #${c.id} by ${esc(c.username)} ${countPill(c)}</h3>
            <p class="modal-sub">${esc(c.note || "")}${c.note ? " · " : ""}started ${fmtWhen(c.created_at)}${c.submitted_at ? ` · sent ${fmtWhen(c.submitted_at)}` : ""}
               · ${count(c.lines.length, "part")} counted, ${matched} matched the app.</p>
            ${diffs.length ? `
            <div class="table-wrap" style="margin-bottom:14px;"><table class="table">
                <thead><tr>${reviewable ? `<th></th>` : ""}<th>Part</th><th class="num">App said</th><th class="num">Counted</th><th class="num">Difference</th><th class="num">${c.status === "approved" ? "Corrected" : "In stock now"}</th></tr></thead>
                <tbody>${diffs.map(l => `
                    <tr>${reviewable ? `<td><input type="checkbox" class="count-apply" value="${l.part_id}" checked></td>` : ""}
                        <td class="card-title"><div class="part-name">${esc(l.part_name)}</div><div class="part-sub code">${esc(l.sku || "")}</div></td>
                        <td class="num" data-label="App said">${l.expected}</td>
                        <td class="num" data-label="Counted">${l.counted}</td>
                        <td class="num" data-label="Difference">${diffText(l.difference)}</td>
                        <td class="num" data-label="${c.status === "approved" ? "Corrected" : "In stock now"}">${c.status === "approved" ? (l.applied ? "✓ yes" : "no") : (l.current_qty ?? "deleted")}</td>
                    </tr>`).join("")}</tbody>
            </table></div>` : `<div class="notice" style="background:var(--ok-bg);color:var(--ok)"><i class="fa-solid fa-circle-check"></i><div>Every part counted matches the app.</div></div>`}
            ${c.review_note ? `<p class="small"><strong>${c.status === "approved" ? "Owner's note" : "Set aside because"}:</strong> ${esc(c.review_note)} — ${esc(c.reviewed_by)}, ${fmtWhen(c.reviewed_at)}</p>` : ""}
            ${reviewable ? `
            <p class="form-hint" style="margin-bottom:10px;">A difference is something to look into, not proof that anyone took anything — recount, check for unrecorded sales,
               damaged or returned items first. Ticked parts move by the difference found, so sales made since the count are kept.</p>
            <div class="form-row"><label class="field-label" for="countReviewNote">Your note</label>
                <input id="countReviewNote" maxlength="200" placeholder="e.g. recounted brake pads, 2 found damaged"></div>` : ""}
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal('countReviewModal')">Close</button>
                ${reviewable && c.status === "submitted" ? `<button class="btn btn-danger-soft" onclick="reviewCount(${c.id}, 'reject')">Set aside</button>` : ""}
                ${reviewable ? `<button class="btn btn-primary" onclick="reviewCount(${c.id}, 'approve')"><i class="fa-solid fa-check"></i> ${diffs.length ? "Correct ticked parts" : "Mark as checked"}</button>` : ""}
            </div>`;
        openModal("countReviewModal");
    } catch (err) { toast(err.message, "error"); }
}

async function reviewCount(id, action) {
    const reason = $("countReviewNote").value.trim();
    if (!reason) return toast("Add a short note about what you found", "error");
    const part_ids = [...document.querySelectorAll(".count-apply:checked")].map(i => Number(i.value));
    try {
        await apiFetch(`/counts/${id}/${action}`, { method: "POST", body: JSON.stringify({ reason, part_ids }) });
        closeModal("countReviewModal");
        toast(action === "approve" ? `Done — ${count(part_ids.length, "part")} corrected` : "Count set aside, no stock changed", "success");
        if (state.count?.id === id) state.count = null;
        await fetchParts();
        loadCounts();
    } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------
   DAILY REPORT (owner)
------------------------------------------------------------------ */
let reportRange = "day";
function setReportRange(r) {
    reportRange = r;
    document.querySelectorAll("#reportRange .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.range === r));
    loadReport();
}
function shiftDay(d, n) {
    const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function loadReport() {
    const dateEl = $("reportDate");
    if (!dateEl.value) dateEl.value = todayLocal();
    if (reportRange !== "day") return loadPeriodReport(dateEl.value);
    $("reportTitle").textContent = "Daily Report";
    $("reportSubtitle").textContent = fmtDayLong(dateEl.value);
    const out = $("reportBody");
    out.innerHTML = `<p class="muted">Loading…</p>`;
    try {
        const r = await apiFetch(`/reports/daily?date=${dateEl.value}`);
        const max = Math.max(...r.last7.map(d => d.revenue), 1);
        out.innerHTML = `
        <div class="stat-grid">
            <div class="stat green">
                <div class="label"><i class="fa-solid fa-sack-dollar"></i>Sales</div>
                <div class="value">${moneyShort(r.revenue)}</div>
                <div class="sub">${count(r.sales, "customer")}</div>
            </div>
            <div class="stat amber">
                <div class="label"><i class="fa-solid fa-chart-line"></i>Profit</div>
                <div class="value">${moneyShort(r.profit)}</div>
                <div class="sub">${r.missing_cost_lines ? `${count(r.missing_cost_lines, "item")} without a cost price` : "after cost of parts"}</div>
            </div>
            <div class="stat blue">
                <div class="label"><i class="fa-solid fa-box"></i>Items sold</div>
                <div class="value">${r.items.toLocaleString("en-NG")}</div>
                <div class="sub">units</div>
            </div>
            <div class="stat red">
                <div class="label"><i class="fa-solid fa-user"></i>Average sale</div>
                <div class="value">${moneyShort(r.sales ? Math.round(r.revenue / r.sales) : 0)}</div>
                <div class="sub">per customer</div>
            </div>
        </div>
        ${r.missing_cost_lines ? `<div class="notice warn" style="margin-top:14px;"><i class="fa-solid fa-circle-info"></i>
            <div>Profit only counts parts that have a cost price. Add cost prices with <strong>Edit</strong> in Stock to see your full profit.</div></div>` : ""}
        ${r.voided?.count ? `<div class="notice warn" style="margin-top:14px;"><i class="fa-solid fa-rotate-left"></i>
            <div>${count(r.voided.count, "sale")} worth ${money(r.voided.value)} cancelled or returned on this day — not counted above. Open them in Sell → Sales to see why.</div></div>` : ""}

        <div class="section-title">End-of-day money check</div>
        ${renderCloseDay(r)}

        <div class="section-title">Last 7 days</div>
        <div class="card" style="padding:0;">
            <div class="bars">${r.last7.map(d => `
                <div class="bar-col ${d.date === r.date ? "on" : ""}" title="${fmtDayLong(d.date)}: ${naira(d.revenue)}">
                    <div class="bar-val">${d.revenue ? nairaShort(d.revenue) : ""}</div>
                    <div class="bar-track"><div class="bar" style="height:${Math.round(d.revenue / max * 100)}%"></div></div>
                    <div class="bar-day">${dayDiff(d.date) === 0 ? "Today" : fmtDayShort(d.date)}</div>
                </div>`).join("")}
            </div>
        </div>

        <div class="report-cols">
            <div>
                <div class="section-title">Best sellers</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Part</th><th class="num">Sold</th><th class="num">Amount</th></tr></thead>
                    <tbody>${r.top_parts.length ? r.top_parts.map(p => `
                        <tr><td class="card-title"><div class="part-name">${esc(p.part_name)}</div><div class="part-sub code">${esc(p.sku || "")}</div></td>
                            <td class="num" data-label="Sold">${p.qty}</td><td class="num" data-label="Amount">${money(p.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales on this day.</td></tr>`}</tbody>
                </table></div>
            </div>
            <div>
                <div class="section-title">By staff</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Staff</th><th class="num">Customers</th><th class="num">Amount</th></tr></thead>
                    <tbody>${r.by_staff.length ? r.by_staff.map(s => `
                        <tr><td class="card-title"><strong>${esc(s.username)}</strong></td><td class="num" data-label="Customers">${s.sales}</td><td class="num" data-label="Amount">${money(s.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales on this day.</td></tr>`}</tbody>
                </table></div>
            </div>
        </div>`;
    } catch (err) {
        out.innerHTML = `<div class="notice alert"><i class="fa-solid fa-circle-exclamation"></i><div>${esc(err.message)}</div></div>`;
    }
}

/* Week = the 7 days ending on the chosen date. Month = the calendar month of the chosen date. */
async function loadPeriodReport(anchor) {
    let from, to, monthEnd = null;
    if (reportRange === "week") { to = anchor; from = shiftDay(anchor, -6); }
    else {
        from = anchor.slice(0, 8) + "01";
        const [y, m] = anchor.split("-").map(Number);
        const last = new Date(y, m, 0).getDate();
        monthEnd = to = anchor.slice(0, 8) + String(last).padStart(2, "0");
        if (to > todayLocal() && todayLocal() >= from) to = todayLocal();
    }
    const [fy, fm] = from.split("-").map(Number);
    $("reportTitle").textContent = reportRange === "week" ? "Weekly Report" : "Monthly Report";
    $("reportSubtitle").textContent = reportRange === "week"
        ? `${fmtDate(from + " 12:00:00", { year: true })} – ${fmtDate(to + " 12:00:00", { year: true })}`
        : `${MONTHS_LONG[fm - 1]} ${fy}${to < monthEnd ? " so far" : ""}`;
    const out = $("reportBody");
    out.innerHTML = `<p class="muted">Loading…</p>`;
    try {
        const r = await apiFetch(`/reports/period?from=${from}&to=${to}`);
        const max = Math.max(...r.days.map(d => d.revenue), 1);
        const many = r.days.length > 10;
        const avgDay = r.days.length ? r.revenue / r.days.length : 0;
        out.innerHTML = `
        <div class="stat-grid">
            <div class="stat green">
                <div class="label"><i class="fa-solid fa-sack-dollar"></i>Sales</div>
                <div class="value">${moneyShort(r.revenue)}</div>
                <div class="sub">${count(r.sales, "customer")} · about ${moneyShort(Math.round(avgDay))} a day</div>
            </div>
            <div class="stat amber">
                <div class="label"><i class="fa-solid fa-chart-line"></i>Profit</div>
                <div class="value">${moneyShort(r.profit)}</div>
                <div class="sub">${r.missing_cost_lines ? `${count(r.missing_cost_lines, "item")} without a cost price` : "after cost of parts"}</div>
            </div>
            <div class="stat blue">
                <div class="label"><i class="fa-solid fa-box"></i>Items sold</div>
                <div class="value">${r.items.toLocaleString("en-NG")}</div>
                <div class="sub">${r.best_day ? `best day: ${dayName(r.best_day.date)}` : "units"}</div>
            </div>
            <div class="stat red">
                <div class="label"><i class="fa-solid fa-warehouse"></i>Stock now</div>
                <div class="value">${moneyShort(r.stock.cost_value || r.stock.sell_value)}</div>
                <div class="sub">${r.stock.cost_value ? "at cost" : "at selling price"} · ${r.stock.low} running low</div>
            </div>
        </div>
        ${r.missing_cost_lines ? `<div class="notice warn" style="margin-top:14px;"><i class="fa-solid fa-circle-info"></i>
            <div>Profit only counts parts that have a cost price, so the real figure is higher. Add cost prices with <strong>Edit</strong> in Stock.</div></div>` : ""}
        ${(r.voided.count || r.corrections.count) ? `<div class="notice warn" style="margin-top:14px;"><i class="fa-solid fa-magnifying-glass"></i><div>
            ${r.voided.count ? `${count(r.voided.count, "sale")} worth ${money(r.voided.value)} cancelled or returned (not counted above). ` : ""}
            ${r.corrections.count ? `${count(r.corrections.count, "stock correction")} (${r.corrections.units > 0 ? "+" : ""}${r.corrections.units} units). ` : ""}
            Details are in the Activity Log. These are things to check, not proof that anything is wrong.</div></div>` : ""}

        <div class="section-title">Day by day</div>
        <div class="card" style="padding:0;">
            <div class="bars ${many ? "many" : ""}" style="grid-template-columns:repeat(${r.days.length},1fr);${many ? "gap:3px;" : ""}">${r.days.map(d => `
                <div class="bar-col" title="${fmtDayLong(d.date)}: ${naira(d.revenue)} (${count(d.sales, "sale")})">
                    <div class="bar-val">${d.revenue ? nairaShort(d.revenue) : ""}</div>
                    <div class="bar-track"><div class="bar" style="height:${Math.round(d.revenue / max * 100)}%"></div></div>
                    <div class="bar-day">${many ? Number(d.date.slice(8)) : (dayDiff(d.date) === 0 ? "Today" : fmtDayShort(d.date))}</div>
                </div>`).join("")}
            </div>
        </div>

        <div class="report-cols">
            <div>
                <div class="section-title">Best sellers</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Part</th><th class="num">Sold</th><th class="num">Amount</th></tr></thead>
                    <tbody>${r.top_parts.length ? r.top_parts.map(p => `
                        <tr><td class="card-title"><div class="part-name">${esc(p.part_name)}</div><div class="part-sub code">${esc(p.sku || "")}</div></td>
                            <td class="num" data-label="Sold">${p.qty}</td><td class="num" data-label="Amount">${money(p.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales in this period.</td></tr>`}</tbody>
                </table></div>
            </div>
            <div>
                <div class="section-title">Not selling <span class="muted">in stock, no sales this period</span></div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Part</th><th class="num">On shelf</th><th class="num">Money tied up</th></tr></thead>
                    <tbody>${r.slow_parts.length ? r.slow_parts.map(p => `
                        <tr><td class="card-title"><div class="part-name">${esc(p.name)}</div><div class="part-sub code">${esc(p.sku || "")}</div></td>
                            <td class="num" data-label="On shelf">${p.qty}</td><td class="num" data-label="Money tied up">${money(p.tied_up)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">Everything in stock sold at least once.</td></tr>`}</tbody>
                </table></div>
            </div>
        </div>

        <div class="report-cols">
            <div>
                <div class="section-title">By staff</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Staff</th><th class="num">Customers</th><th class="num">Amount</th></tr></thead>
                    <tbody>${r.by_staff.length ? r.by_staff.map(s => `
                        <tr><td class="card-title"><strong>${esc(s.username)}</strong></td><td class="num" data-label="Customers">${s.sales}</td><td class="num" data-label="Amount">${money(s.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales in this period.</td></tr>`}</tbody>
                </table></div>
            </div>
            <div>
                <div class="section-title">How customers paid</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Payment</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
                    <tbody>${["cash", "pos", "transfer"].map(m => `
                        <tr><td class="card-title"><strong>${PAY_LABELS[m]}</strong></td><td class="num" data-label="Amount">${money(r.by_method[m] || 0)}</td>
                            <td class="num" data-label="Share">${r.revenue ? Math.round((r.by_method[m] || 0) / r.revenue * 100) : 0}%</td></tr>`).join("")}</tbody>
                </table></div>
            </div>
        </div>`;
    } catch (err) {
        out.innerHTML = `<div class="notice alert"><i class="fa-solid fa-circle-exclamation"></i><div>${esc(err.message)}</div></div>`;
    }
}

function renderCloseDay(r) {
    const exp = r.by_method, c = r.close;
    const row = (label, expected, counted) => {
        const diff = counted == null ? null : counted - expected;
        const cls  = diff == null ? "" : diff === 0 ? "ok" : diff < 0 ? "short" : "over";
        const txt  = diff == null ? "—" : diff === 0 ? "✓ Matches" : (diff < 0 ? "Short by " : "Over by ") + money(Math.abs(diff));
        return `<tr><td class="card-title"><strong>${label}</strong></td><td class="num" data-label="App says">${money(expected)}</td>
                <td class="num" data-label="You counted">${counted == null ? "—" : money(counted)}</td>
                <td class="num" data-label="Difference"><span class="diff ${cls}">${txt}</span></td></tr>`;
    };
    return `
    <div class="card">
        <p class="muted small" style="margin-bottom:14px;">At closing, count the cash in the drawer, check the POS terminal's end-of-day total and your bank app,
           then enter what you actually have. A gap means a sale was missed, recorded wrongly, or money is missing.</p>
        <div class="table-wrap" style="margin-bottom:16px;"><table class="table">
            <thead><tr><th>Payment</th><th class="num">App says</th><th class="num">You counted</th><th class="num">Difference</th></tr></thead>
            <tbody>${row("Cash", exp.cash, c?.cash_counted)}${row("POS", exp.pos, c?.pos_total)}${row("Transfer", exp.transfer, c?.transfer_total)}</tbody>
        </table></div>
        <div class="grid-3">
            <div class="form-row"><label class="field-label" for="closeCash">Cash in drawer (₦)</label><input id="closeCash" type="number" min="0" inputmode="decimal" value="${c ? c.cash_counted : ""}"></div>
            <div class="form-row"><label class="field-label" for="closePos">POS terminal total (₦)</label><input id="closePos" type="number" min="0" inputmode="decimal" value="${c ? c.pos_total : ""}"></div>
            <div class="form-row"><label class="field-label" for="closeTransfer">Transfers received (₦)</label><input id="closeTransfer" type="number" min="0" inputmode="decimal" value="${c ? c.transfer_total : ""}"></div>
        </div>
        <div class="form-row"><label class="field-label" for="closeNote">Note <span class="muted">(optional)</span></label>
            <input id="closeNote" maxlength="300" value="${esc(c?.note || "")}" placeholder="e.g. ₦2,000 given to driver for fuel"></div>
        <div class="toolbar" style="margin:0;">
            <button class="btn btn-primary" onclick="saveCloseDay()"><i class="fa-solid fa-lock"></i> ${c ? "Update" : "Save"} day check</button>
            ${c ? `<span class="muted small">Saved by ${esc(c.closed_by)} · ${fmtWhen(c.closed_at)}</span>` : ""}
        </div>
    </div>`;
}

async function saveCloseDay() {
    const body = {
        date: $("reportDate").value,
        cash: parseFloat($("closeCash").value || "0"),
        pos: parseFloat($("closePos").value || "0"),
        transfer: parseFloat($("closeTransfer").value || "0"),
        note: $("closeNote").value.trim()
    };
    try {
        await apiFetch("/reports/close", { method: "POST", body: JSON.stringify(body) });
        toast("Day check saved", "success");
        loadReport();
    } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------
   BARCODES — look-up, typed codes and plug-in scanners
------------------------------------------------------------------ */
// Parts without a manufacturer barcode get an in-store EAN-13 starting "200" — GS1 keeps 20–29 for a shop's own items.
function shopCode(id) {
    const body = "200" + String(id).padStart(9, "0");
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 ? 3 : 1);
    return body + ((10 - (sum % 10)) % 10);
}

function findPartByCode(raw) {
    const code = String(raw || "").trim().toLowerCase();
    if (!code) return null;
    return state.parts.find(p => (p.barcode || "").toLowerCase() === code)
        || state.parts.find(p => p.sku.toLowerCase() === code)
        || state.parts.find(p => shopCode(p.id) === code)
        || null;
}

function handleScanInput(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addByCode(e.target.value);
    e.target.value = "";
}

function addByCode(code) {
    const p = findPartByCode(code);
    if (!p) {
        beep(false);
        toast("No part has that code. Add the barcode to the part with Edit in Stock.", "error");
        return false;
    }
    if (leftFor(p) <= 0) { beep(false); toast(`${p.name} is out of stock`, "error"); return false; }
    addLine(p.id, 1);
    populateSaleDropdown();
    beep(true);
    toast(`Added ${p.name}`, "success");
    return true;
}

let audioCtx;
function beep(ok) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = ok ? 1250 : 300; g.gain.value = 0.08;
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25));
    } catch (_) {}
    try { navigator.vibrate?.(ok ? 40 : [80, 60, 80]); } catch (_) {}
}

/* Camera scanner ---------------------------------------------------- */
const SCANNER_LIB = "vendor/html5-qrcode.min.js";      // kept inside the app so scanning works offline
const LABEL_LIB   = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js";
const loadedScripts = {};
function loadScript(src) {
    if (!loadedScripts[src]) {
        loadedScripts[src] = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src; s.onload = resolve;
            s.onerror = () => { delete loadedScripts[src]; reject(new Error("Couldn't load the scanner. Check your internet.")); };
            document.head.appendChild(s);
        });
    }
    return loadedScripts[src];
}

let scanner = null, lastScan = { code: "", at: 0 };

// "sale" keeps scanning and adds to the sale; "newBarcode"/"editBarcode" fill that box and close
async function openScanner(target) {
    state.scanTarget = target;
    lastScan = { code: "", at: 0 };
    $("scanHint").textContent = target === "sale"
        ? "Point the camera at a barcode. Each beep adds one to the sale."
        : target === "count"
            ? "Counting: each beep adds one to the count. Nothing is sold."
            : "Point the camera at the barcode on the box.";
    $("scanStatus").textContent = "";
    openModal("scannerModal");

    if (!window.isSecureContext) {
        $("scanStatus").textContent = "The camera only works when the app is opened with https://";
        return;
    }
    $("scanStatus").textContent = "Starting camera…";
    try {
        await loadScript(SCANNER_LIB);
        const F = Html5QrcodeSupportedFormats;
        scanner = new Html5Qrcode("scanView", {
            formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE],
            useBarCodeDetectorIfSupported: true, verbose: false
        });
        await scanner.start({ facingMode: "environment" }, { fps: 12 }, onScan, () => {});
        $("scanStatus").textContent = "";
    } catch (err) {
        const msg = String(err?.message || err);
        $("scanStatus").textContent = /Permission|NotAllowed/i.test(msg)
            ? "Camera access was blocked. Allow the camera for this site in your browser settings."
            : /NotFound|device not found/i.test(msg)
                ? "No camera found. Type the code, or use a plug-in scanner."
                : msg;
        await stopScanner(true);
    }
}

function onScan(text) {
    // ~12 reads a second: a code only counts again after it has left the view for over 1.2 seconds
    const now = Date.now();
    const stillInView = text === lastScan.code && now - lastScan.at < 1200;
    lastScan = { code: text, at: now };
    if (stillInView) return;

    if (state.scanTarget === "sale") { addByCode(text); return; }
    if (state.scanTarget === "count") { addCountByCode(text); return; }
    $(state.scanTarget === "editBarcode" ? "editBarcode" : "newBarcode").value = text;
    beep(true);
    closeScanner();
}

async function stopScanner(keepOpen = false) {
    if (scanner) {
        try { if (scanner.isScanning) await scanner.stop(); } catch (_) {}
        try { scanner.clear(); } catch (_) {}
        scanner = null;
    }
    if (!keepOpen) $("scannerModal").classList.remove("open");
}
function closeScanner() { stopScanner(false); }

/* ------------------------------------------------------------------
   BARCODE LABELS (owner)
------------------------------------------------------------------ */
function renderLabelPicker() {
    const q = ($("labelSearch").value || "").toLowerCase().trim();
    const list = state.parts.filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    $("labelTableBody").innerHTML = list.length ? list.map(p => `
        <tr>
            <td class="card-title"><div class="part-name">${esc(p.name)}</div><div class="part-sub code">${esc(p.sku)}</div></td>
            <td data-label="Label uses">${p.barcode
                ? `<span class="tag"><i class="fa-solid fa-barcode"></i>Barcode from the box</span>`
                : `<span class="tag"><i class="fa-solid fa-store"></i>Shop barcode</span>`}</td>
            <td class="num" data-label="In stock">${p.qty}</td>
            <td class="num" data-label="Labels">
                <div class="stepper">
                    <button onclick="stepLabels(${p.id}, -1)" aria-label="One less">−</button>
                    <input type="number" min="0" max="500" value="${state.labelCopies[p.id] || 0}" inputmode="numeric" onchange="setLabelCopies(${p.id}, this.value)">
                    <button onclick="stepLabels(${p.id}, 1)" aria-label="One more">+</button>
                </div>
            </td>
        </tr>`).join("")
        : `<tr><td class="empty-cell" colspan="4">No parts found.</td></tr>`;
    updateLabelCount();
}
function setLabelCopies(id, v) {
    const n = Math.max(0, Math.min(500, parseInt(v) || 0));
    if (n) state.labelCopies[id] = n; else delete state.labelCopies[id];
    updateLabelCount();
}
function stepLabels(id, d) { setLabelCopies(id, (state.labelCopies[id] || 0) + d); renderLabelPicker(); }
function labelsMatchStock() {
    state.labelCopies = {};
    state.parts.forEach(p => { if (p.qty > 0) state.labelCopies[p.id] = Math.min(p.qty, 500); });
    renderLabelPicker();
}
function clearLabels() { state.labelCopies = {}; renderLabelPicker(); }
function updateLabelCount() {
    const total = Object.values(state.labelCopies).reduce((s, n) => s + n, 0);
    $("labelCount").textContent = total ? `${count(total, "label")} · ${count(Math.ceil(total / 21), "A4 page")}` : "No labels chosen";
    $("printLabelsBtn").disabled = !total;
}

async function printLabels() {
    const showPrice = $("labelShowPrice").checked;
    const items = [];
    for (const [id, n] of Object.entries(state.labelCopies)) {
        const p = state.parts.find(x => x.id === Number(id));
        if (p) for (let i = 0; i < n; i++) items.push(p);
    }
    if (!items.length) return;
    try { await loadScript(LABEL_LIB); } catch (err) { return toast(err.message, "error"); }

    $("labelSheet").innerHTML = items.map((p, i) => `
        <div class="label">
            <div class="lb-name">${esc(p.name)}</div>
            <svg class="lb-code" id="lb${i}"></svg>
            <div class="lb-foot"><span>${esc(p.sku)}</span>${showPrice ? `<strong>${naira(p.price)}</strong>` : ""}</div>
        </div>`).join("");
    items.forEach((p, i) => {
        const value = p.barcode || shopCode(p.id);
        const fmt = /^\d{13}$/.test(value) ? "EAN13" : /^\d{8}$/.test(value) ? "EAN8" : "CODE128";
        const opts = { height: 50, width: 2, fontSize: 13, margin: 12, displayValue: true };   // margin = quiet zone scanners need
        try { JsBarcode(`#lb${i}`, value, { format: fmt, ...opts }); }
        catch (_) { JsBarcode(`#lb${i}`, value, { format: "CODE128", ...opts }); }
    });
    document.body.classList.add("printing-labels");
    setTimeout(() => {
        window.print();
        setTimeout(() => document.body.classList.remove("printing-labels"), 500);
    }, 150);
}

/* ------------------------------------------------------------------
   SETTINGS — shop details, staff, backups (owner)
------------------------------------------------------------------ */
function fillShopForm() {
    $("shopNameInput").value = state.shop.name || "";
    $("shopAddressInput").value = state.shop.address || "";
    $("shopPhoneInput").value = state.shop.phone || "";
    $("shopNoteInput").value = state.shop.receipt_note || "";
}
async function saveShopDetails() {
    const body = {
        name: $("shopNameInput").value.trim(),
        address: $("shopAddressInput").value.trim(),
        phone: $("shopPhoneInput").value.trim(),
        receipt_note: $("shopNoteInput").value.trim()
    };
    if (!body.name) return toast("Enter your business name", "error");
    try {
        state.shop = await apiFetch("/settings", { method: "PUT", body: JSON.stringify(body) });
        applyShopName();
        toast("Shop details saved — receipts now show them", "success");
    } catch (err) { toast(err.message, "error"); }
}

async function loadUsers() {
    const tbody = $("usersList");
    try {
        state.users = await apiFetch("/users");
        tbody.innerHTML = state.users.map(u => `
            <tr>
                <td class="card-title"><div class="user-card" style="padding:0;">
                    <div class="avatar">${esc(u.username.charAt(0).toUpperCase())}</div><strong>${esc(u.username)}</strong></div></td>
                <td data-label="Role"><span class="pill plain">${u.role === "admin" ? "Owner" : "Staff"}</span></td>
                <td class="actions">${u.id !== state.user.id
                    ? `<button class="btn btn-danger-soft btn-sm" onclick="deleteUser(${u.id})"><i class="fa-solid fa-user-minus"></i> Remove</button>`
                    : `<span class="muted small">That's you</span>`}</td>
            </tr>`).join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td class="empty-cell c-out" colspan="3">${esc(err.message)}</td></tr>`;
    }
}
function openAddUserModal() {
    ["newUserName", "newUserPass"].forEach(id => $(id).value = "");
    $("newUserRole").value = "staff";
    openModal("addUserModal");
}
async function confirmAddUser() {
    const username = $("newUserName").value.trim(), password = $("newUserPass").value, role = $("newUserRole").value;
    if (!username || !password) return toast("Enter a username and a starting password", "error");
    if (password.length < 6)    return toast("The password needs at least 6 characters", "error");
    try {
        await apiFetch("/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
        toast(`${username} added`, "success");
        closeModal("addUserModal");
        loadUsers();
    } catch (err) { toast(err.message, "error"); }
}
async function deleteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u || !confirm(`Remove ${u.username}? They won't be able to sign in any more.`)) return;
    try {
        await apiFetch(`/users/${id}`, { method: "DELETE" });
        toast(`${u.username} removed`, "info");
        loadUsers();
    } catch (err) { toast(err.message, "error"); }
}

async function checkStorage() {
    try {
        const st = await apiFetch("/admin/storage");
        $("storageWarn").hidden = st.permanent;
        $("backupInfo").innerHTML = !st.permanent
            ? `<span class="c-out"><i class="fa-solid fa-triangle-exclamation"></i> The server isn't saving data permanently yet. Download a backup now.</span>`
            : st.storage === "turso"
                ? `<span class="c-ok"><i class="fa-solid fa-circle-check"></i></span> Your data is stored safely online and is kept when the server restarts.`
                : `<span class="c-ok"><i class="fa-solid fa-circle-check"></i></span> The server keeps a copy every day${st.backups_kept ? ` (${st.backups_kept} kept)` : ""}.`;
    } catch (_) {}
}

async function downloadBackup() {
    try {
        const res = await fetch(`${apiBase()}/admin/backup`, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!res.ok) throw new Error("The backup didn't download — try again");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${shopName()} backup ${fmtDate(todayLocal(), { year: true })}.db`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast("Backup downloaded. Keep it somewhere safe, like Google Drive.", "success");
    } catch (err) { toast(err.message, "error"); }
}

async function restoreBackup(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!confirm(`Replace ALL current data with "${file.name}"?\n\nDownload a backup of today's data first if you might need it.`)) return;
    try {
        const res = await fetch(`${apiBase()}/admin/restore`, {
            method: "POST",
            headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/octet-stream" },
            body: file
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Restore failed");
        toast(data.message, "success");
        setTimeout(() => signOutLocal("Backup restored. Sign in with the passwords from that backup."), 2500);
    } catch (err) { toast(err.message, "error"); }
}

/* ------------------------------------------------------------------
   ACTIVITY LOG (owner)
------------------------------------------------------------------ */
const ACTIONS = {
    SALE:            ["Sale",              "fa-cash-register",  "c-ok"],
    RESTOCK:         ["Stock added",       "fa-arrow-up",       "c-accent"],
    ADJUST:          ["Stock corrected",   "fa-scale-balanced", "c-low"],
    ADD_PART:        ["Part added",        "fa-plus",           "c-accent"],
    EDIT_PART:       ["Part edited",       "fa-pen",            "c-accent"],
    DELETE_PART:     ["Part deleted",      "fa-trash",          "c-out"],
    ADD_USER:        ["Staff added",       "fa-user-plus",      "c-accent"],
    DELETE_USER:     ["Staff removed",     "fa-user-minus",     "c-out"],
    CHANGE_PASSWORD: ["Password changed",  "fa-key",            "c-muted"],
    DAY_CLOSE:       ["Day check",         "fa-lock",           "c-ok"],
    SHOP_DETAILS:    ["Shop details",      "fa-store",          "c-accent"],
    BACKUP:          ["Backup downloaded", "fa-download",       "c-muted"],
    RESTORE:         ["Backup restored",   "fa-upload",         "c-low"],
    VOID_SALE:       ["Sale cancelled",    "fa-rotate-left",    "c-out"],
    LOGIN:           ["Signed in",         "fa-right-to-bracket", "c-muted"],
    LOGOUT:          ["Signed out",        "fa-right-from-bracket", "c-muted"],
    LOGIN_FAILED:    ["Wrong password",    "fa-user-lock",      "c-low"],
    LOGIN_BLOCKED:   ["Sign-in blocked",   "fa-ban",            "c-out"],
    COUNT_START:     ["Count started",     "fa-clipboard-list", "c-accent"],
    ADD_CUSTOMER:    ["Customer added",    "fa-user-plus",      "c-accent"],
    EDIT_CUSTOMER:   ["Customer edited",   "fa-user-pen",       "c-accent"],
    DELETE_CUSTOMER: ["Customer removed",  "fa-user-minus",     "c-out"],
    RECEIPT_SENT:    ["Receipt sent",      "fa-paper-plane",    "c-ok"],
    COUNT_SUBMIT:    ["Count sent",        "fa-paper-plane",    "c-accent"],
    COUNT_APPROVE:   ["Count reviewed",    "fa-clipboard-check","c-ok"],
    COUNT_REJECT:    ["Count set aside",   "fa-clipboard",      "c-low"]
};

// Older entries had plain numbers ("₦5000"); show them with commas
const tidyNote = n => String(n || "").replace(/₦(\d{4,})(\.\d+)?/g, (_, a, b) => naira(Number(a + (b || ""))));

async function loadAuditLog() {
    const tbody = $("auditTableBody");
    tbody.innerHTML = `<tr><td class="empty-cell" colspan="6">Loading…</td></tr>`;
    try {
        const { logs } = await apiFetch("/audit?limit=200");
        tbody.innerHTML = logs.length ? logs.map(l => {
            const [label, icon, cls] = ACTIONS[l.action] || [l.action.replace(/_/g, " ").toLowerCase(), "fa-circle", "c-muted"];
            const change = l.qty_change != null
                ? `<strong class="${l.qty_change < 0 ? "c-out" : "c-ok"}">${l.qty_change > 0 ? "+" : ""}${l.qty_change}</strong>` : "—";
            return `
            <tr>
                <td class="card-title"><span class="action-label ${cls} show-sm"><i class="fa-solid ${icon}"></i>${label}</span>
                    <span class="nowrap">${fmtWhen(l.created_at)}</span></td>
                <td data-label="What" class="hide-sm-cell"><span class="action-label ${cls}"><i class="fa-solid ${icon}"></i>${label}</span></td>
                <td data-label="Who">${esc(l.username)}</td>
                <td data-label="Part" class="${l.part_name ? "" : "blank"}">${esc(l.part_name || "—")}</td>
                <td class="num ${l.qty_change != null ? "" : "blank"}" data-label="Stock change">${change}</td>
                <td data-label="Details" class="small">${esc(tidyNote(l.note) || "—")}</td>
            </tr>`;
        }).join("") : `<tr><td class="empty-cell" colspan="6">Nothing recorded yet.</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td class="empty-cell c-out" colspan="6">${esc(err.message)}</td></tr>`;
    }
}

/* ------------------------------------------------------------------
   MODALS & TOASTS
------------------------------------------------------------------ */
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id, force = false) {
    const m = $(id);
    if (!m) return;
    if (!force && m.dataset.forced === "1") return;   // a required password change can't be skipped
    m.dataset.forced = "";
    m.classList.remove("open");
    if (id === "scannerModal") stopScanner();
}
document.addEventListener("click", e => {
    if (e.target.classList.contains("modal-overlay")) closeModal(e.target.id);
});
document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(m => closeModal(m.id));
});

function toast(msg, type = "info") {
    const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${esc(msg)}</span>`;
    $("toast-container").appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0"; el.style.transform = "translateY(8px)";
        setTimeout(() => el.remove(), 300);
    }, type === "error" ? 4000 : 2600);
}
