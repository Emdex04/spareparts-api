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

const BASE = (() => {
    const h = window.location.hostname;
    const local = h === "localhost" || h === "127.0.0.1";
    if (window.location.protocol === "file:" || (local && window.location.port !== "5000"))
        return "http://localhost:5000/api";
    if (local || h.endsWith("onrender.com")) return "/api";   // app served by the API server itself
    return "https://spareparts-api-4343.onrender.com/api";
})();

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
// ₦1.25m / ₦85k for tight spaces (stat cards, chart labels); the full figure shows on hover
function nairaShort(n) {
    const v = Number(n || 0), a = Math.abs(v);
    if (a >= 1e9) return "₦" + +(v / 1e9).toFixed(2) + "bn";
    if (a >= 1e6) return "₦" + +(v / 1e6).toFixed(2) + "m";
    if (a >= 1e5) return "₦" + +(v / 1e3).toFixed(0) + "k";
    return naira(v);
}
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
        res = await fetch(`${BASE}${path}`, { ...options, headers });
    } catch (_) {
        throw new Error("Can't reach the server. Check your internet connection.");
    }
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
    } catch (_) {
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
    try { await apiFetch("/users/logout", { method: "POST" }); } catch (_) {}
    signOutLocal();
    location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
    ["loginUser", "loginPass"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); }));
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
    if (id === "labels")    renderLabelPicker();
    if (id === "audit")     loadAuditLog();
    if (id === "users")     { loadUsers(); checkStorage(); fillShopForm(); }
    if (id !== "sales")     stopScanner();
    window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------
   LOADING DATA
------------------------------------------------------------------ */
async function initApp() {
    await Promise.all([fetchParts(), fetchShop()]);
    if (isAdmin()) checkStorage();
}

async function fetchShop() {
    try { state.shop = await apiFetch("/settings"); } catch (_) {}
    applyShopName();
}

async function fetchParts() {
    try {
        state.parts = await apiFetch("/parts");
        renderAll();
    } catch (err) {
        toast(err.message || "Couldn't load your stock", "error");
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
            <div class="value" title="${naira(value)}">${nairaShort(value)}</div>
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
        const total = sales.reduce((s, x) => s + x.total, 0);
        $("todayHeading").innerHTML = `${isAdmin() ? "Today's sales" : "Your sales today"} <span class="muted">${count(sales.length, "sale")} · ${naira(total)}</span>`;
        list.innerHTML = sales.length ? sales.slice(0, 8).map(saleRow).join("")
            : `<div class="empty" style="border:0;"><i class="fa-solid fa-receipt"></i>No sales yet today.</div>`;
    } catch (_) {
        list.innerHTML = `<div class="empty" style="border:0;">Couldn't load today's sales.</div>`;
    }
}

function saleRow(s) {
    return `
        <div class="list-row clickable" onclick="viewReceipt(${s.id})">
            <div class="list-icon"><i class="fa-solid ${PAY_ICONS[s.payment_method] || "fa-receipt"}"></i></div>
            <div class="list-main">
                <strong>${esc(s.customer || "Walk-in customer")}</strong>
                <div class="muted">${receiptShort(s.receipt_no)} · ${count(s.item_count, "item")} · ${esc(PAY_LABELS[s.payment_method] || "Cash")}${isAdmin() ? " · " + esc(s.username) : ""}</div>
            </div>
            <div class="list-end"><strong>${naira(s.total)}</strong><span class="muted small">${fmtTime(s.created_at)}</span></div>
        </div>`;
}

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
            <td class="num" data-label="Price"><span>${naira(p.price)}${isAdmin() && p.cost ? `<span class="muted small block">cost ${naira(p.cost)}</span>` : ""}</span></td>
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
    try {
        await apiFetch(`/parts/${p.id}/restock`, { method: "POST", body: JSON.stringify({ qty }) });
        toast(`Added ${qty} × ${p.name}`, "success");
        closeModal("restockModal");
        await fetchParts();
    } catch (err) { toast(err.message, "error"); }
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
        : `${left} left · ${qty > 0 ? `${qty} × ${naira(p.price)} = <strong>${naira(qty * p.price)}</strong>` : naira(p.price) + " each"}`;
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
            <div class="cart-line-main"><strong>${esc(p.name)}</strong><span>${naira(p.price)} each</span></div>
            <div class="stepper">
                <button onclick="changeCartQty(${p.id}, -1)" aria-label="One less">−</button>
                <span>${c.qty}</span>
                <button onclick="changeCartQty(${p.id}, 1)" aria-label="One more">+</button>
            </div>
            <div class="cart-line-total">${naira(line)}</div>
        </div>`;
    }).join("") : `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i>&nbsp; Nothing added yet</div>`;
    $("cartTotal").textContent = naira(total);
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
    try {
        const sale = await apiFetch("/sales", {
            method: "POST",
            body: JSON.stringify({ items: state.cart, customer: $("saleCustomer").value.trim(), payment_method: state.payMethod })
        });
        state.cart = [];
        $("saleCustomer").value = "";
        setPayMethod(null);
        toast(`Sale saved — ${naira(sale.total)}`, "success");
        await fetchParts();
        loadSalesHistory();
        showReceipt(sale);
    } catch (err) {
        toast(err.message || "The sale didn't save — try again", "error");
        await fetchParts();
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
        const total = sales.reduce((s, x) => s + x.total, 0);
        $("historySummary").textContent = `${dayName(dateEl.value)} · ${count(sales.length, "sale")} · ${naira(total)}`;
        tbody.innerHTML = sales.length ? sales.map(s => `
            <tr class="clickable" onclick="viewReceipt(${s.id})">
                <td class="card-title"><strong>${esc(s.customer || "Walk-in customer")}</strong><div class="muted small">${receiptShort(s.receipt_no)}</div></td>
                <td data-label="Time">${fmtTime(s.created_at)}</td>
                <td data-label="Paid by">${esc(PAY_LABELS[s.payment_method] || "Cash")}</td>
                <td data-label="Served by">${esc(s.username)}</td>
                <td class="num" data-label="Total"><strong>${naira(s.total)}</strong></td>
            </tr>`).join("")
            : `<tr><td class="empty-cell" colspan="5">No sales ${dayDiff(dateEl.value) === 0 ? "yet today" : "on this day"}.</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td class="empty-cell c-out" colspan="5">${esc(err.message)}</td></tr>`;
    }
}

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
        <div class="rc-ref">${esc(sale.receipt_no)}</div>`;
    openModal("receiptModal");
}

function printReceipt() {
    document.body.classList.add("printing-receipt");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-receipt"), 500);
}

function shareReceipt() {
    const r = state.lastReceipt, s = state.shop;
    if (!r) return;
    const text = [
        `*${shopName()}*`,
        s.address || null,
        s.phone || null,
        "",
        `Receipt ${receiptShort(r.receipt_no)} · ${fmtDate(r.created_at, { year: true })}, ${fmtTime(r.created_at)}`,
        r.customer ? `Customer: ${r.customer}` : null,
        "",
        ...r.items.map(i => `${i.part_name} × ${i.qty} — ${naira(i.line_total)}`),
        "",
        `*Total: ${naira(r.total)}* (${PAY_LABELS[r.payment_method] || "Cash"})`,
        s.receipt_note || "Thank you for your patronage",
        `Ref: ${r.receipt_no}`
    ].filter(l => l !== null).join("\n");
    if (navigator.share) navigator.share({ title: `Receipt ${receiptShort(r.receipt_no)}`, text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

/* ------------------------------------------------------------------
   DAILY REPORT (owner)
------------------------------------------------------------------ */
async function loadReport() {
    const dateEl = $("reportDate");
    if (!dateEl.value) dateEl.value = todayLocal();
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
                <div class="value" title="${naira(r.revenue)}">${nairaShort(r.revenue)}</div>
                <div class="sub">${count(r.sales, "customer")}</div>
            </div>
            <div class="stat amber">
                <div class="label"><i class="fa-solid fa-chart-line"></i>Profit</div>
                <div class="value" title="${naira(r.profit)}">${nairaShort(r.profit)}</div>
                <div class="sub">${r.missing_cost_lines ? `${count(r.missing_cost_lines, "item")} without a cost price` : "after cost of parts"}</div>
            </div>
            <div class="stat blue">
                <div class="label"><i class="fa-solid fa-box"></i>Items sold</div>
                <div class="value">${r.items.toLocaleString("en-NG")}</div>
                <div class="sub">units</div>
            </div>
            <div class="stat red">
                <div class="label"><i class="fa-solid fa-user"></i>Average sale</div>
                <div class="value" title="${naira(r.sales ? r.revenue / r.sales : 0)}">${nairaShort(r.sales ? Math.round(r.revenue / r.sales) : 0)}</div>
                <div class="sub">per customer</div>
            </div>
        </div>
        ${r.missing_cost_lines ? `<div class="notice warn" style="margin-top:14px;"><i class="fa-solid fa-circle-info"></i>
            <div>Profit only counts parts that have a cost price. Add cost prices with <strong>Edit</strong> in Stock to see your full profit.</div></div>` : ""}

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
                            <td class="num" data-label="Sold">${p.qty}</td><td class="num" data-label="Amount">${naira(p.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales on this day.</td></tr>`}</tbody>
                </table></div>
            </div>
            <div>
                <div class="section-title">By staff</div>
                <div class="table-wrap"><table class="table">
                    <thead><tr><th>Staff</th><th class="num">Customers</th><th class="num">Amount</th></tr></thead>
                    <tbody>${r.by_staff.length ? r.by_staff.map(s => `
                        <tr><td class="card-title"><strong>${esc(s.username)}</strong></td><td class="num" data-label="Customers">${s.sales}</td><td class="num" data-label="Amount">${naira(s.revenue)}</td></tr>`).join("")
                        : `<tr><td class="empty-cell" colspan="3">No sales on this day.</td></tr>`}</tbody>
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
        const txt  = diff == null ? "—" : diff === 0 ? "✓ Matches" : (diff < 0 ? "Short by " : "Over by ") + naira(Math.abs(diff));
        return `<tr><td class="card-title"><strong>${label}</strong></td><td class="num" data-label="App says">${naira(expected)}</td>
                <td class="num" data-label="You counted">${counted == null ? "—" : naira(counted)}</td>
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
const SCANNER_LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
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
        const res = await fetch(`${BASE}/admin/backup`, { headers: { Authorization: `Bearer ${state.token}` } });
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
        const res = await fetch(`${BASE}/admin/restore`, {
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
    RESTORE:         ["Backup restored",   "fa-upload",         "c-low"]
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
