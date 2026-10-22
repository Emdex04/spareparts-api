/* ============================================================
   STATE
============================================================ */
const state = {
    user: null,
    token: null,
    parts: [],
    users: [],
    cart: [],              // [{ part_id, qty }]
    currentFilter: "all",
    restockTargetId: null,
    editTargetId: null,
    lastReceipt: null,
    payMethod: null,       // "cash" | "pos" | "transfer"
    scanTarget: null,      // where a camera scan goes
    labelCopies: {}        // part_id -> number of labels to print
};

/* ============================================================
   BACKEND URL
============================================================ */
const BASE = (() => {
    const h = window.location.hostname;
    const local = h === "localhost" || h === "127.0.0.1";
    if (window.location.protocol === "file:" || (local && window.location.port !== "5000"))
        return "http://localhost:5000/api";
    if (local || h.endsWith("onrender.com"))
        return "/api";                                     // app served by the API server itself
    return "https://spareparts-api-4343.onrender.com/api";
})();

/* ============================================================
   SMALL HELPERS
============================================================ */
const $ = id => document.getElementById(id);

function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const naira = n => "₦" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const isAdmin = () => state.user?.role === "admin";

function store(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {}
}
function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
}
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ============================================================
   TOAST
============================================================ */
function toast(msg, type = "info") {
    const container = $("toast-container");
    if (!container) return;
    const icons = { success: "fa-check-circle", error: "fa-circle-xmark", info: "fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${esc(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(20px)";
        setTimeout(() => el.remove(), 300);
    }, 2800);
}

/* ============================================================
   API CORE — sends the sign-in token
============================================================ */
async function apiFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

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
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
}

/* ============================================================
   LOGIN / SESSION
============================================================ */
async function handleLogin() {
    const username = $("loginUser")?.value?.trim();
    const password = $("loginPass")?.value;
    const btn      = $("loginBtn");

    if (!username || !password) { showLoginError("Enter username and password"); return; }

    if (btn) { btn.classList.add("loading"); btn.disabled = true; btn.textContent = "Signing in..."; }
    $("loginError").style.display = "none";

    try {
        const { token, user } = await apiFetch("/users/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        state.token = token;
        store("sp_token", token);
        $("loginPass").value = "";
        await enterApp(user);
    } catch (err) {
        showLoginError(err.message || "Invalid login details");
    } finally {
        if (btn) { btn.classList.remove("loading"); btn.disabled = false; btn.textContent = "Sign In"; }
    }
}

async function enterApp(user) {
    state.user = user;
    const name = user.username;
    $("userDisplayName").textContent = name;
    $("userAvatar").textContent      = name.charAt(0).toUpperCase();

    const roleBadge = $("userRoleBadge");
    if (roleBadge) {
        roleBadge.textContent = user.role.toUpperCase();
        roleBadge.style.color = user.role === "admin" ? "var(--accent2)" : "var(--muted)";
    }

    $("loginScreen").style.display  = "none";
    $("appContainer").style.display = "block";

    document.querySelectorAll(".admin-only").forEach(el => {
        el.style.display = user.role === "admin" ? "" : "none";
    });

    syncMobileNav();

    if (user.must_change_password) {
        openPasswordModal(true);
        return;
    }
    await initApp();
    showSection("dashboard");
}

// Restore a saved sign-in when the app is reopened
async function resumeSession() {
    const saved = load("sp_token");
    if (!saved) return;
    state.token = saved;
    try {
        const user = await apiFetch("/users/me");
        await enterApp(user);
    } catch (_) {
        state.token = null;
        store("sp_token", null);
    }
}

function signOutLocal(msg) {
    state.token = null;
    state.user  = null;
    state.cart  = [];
    store("sp_token", null);
    $("appContainer").style.display = "none";
    $("loginScreen").style.display  = "";
    const mobileNav = $("mobileNav");
    if (mobileNav) mobileNav.style.display = "none";
    document.querySelectorAll(".modal-overlay.open").forEach(m => { m.dataset.forced = ""; m.classList.remove("open"); });
    if (msg) showLoginError(msg);
}

async function logout() {
    try { await apiFetch("/users/logout", { method: "POST" }); } catch (_) {}
    signOutLocal();
    location.reload();
}

function syncMobileNav() {
    const mobileNav = $("mobileNav");
    if (mobileNav && state.user) mobileNav.style.display = window.innerWidth <= 640 ? "block" : "none";
}
window.addEventListener("resize", syncMobileNav);

document.addEventListener("DOMContentLoaded", () => {
    ["loginUser", "loginPass"].forEach(id => {
        $(id)?.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
    });
    resumeSession();
});

function showLoginError(msg) {
    const el = $("loginError");
    if (!el) return;
    el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${esc(msg)}`;
    el.style.display = "block";
}

/* ============================================================
   CHANGE PASSWORD
============================================================ */
function openPasswordModal(forced = false) {
    ["pwCurrent", "pwNew", "pwConfirm"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    $("pwForcedNote").style.display = forced ? "block" : "none";
    $("pwCancelBtn").style.display  = forced ? "none" : "";
    $("passwordModal").dataset.forced = forced ? "1" : "";
    openModal("passwordModal");
}

async function confirmPasswordChange() {
    const current = $("pwCurrent").value;
    const fresh   = $("pwNew").value;
    const again   = $("pwConfirm").value;
    if (!current || !fresh) { toast("Fill in all the fields", "error"); return; }
    if (fresh !== again)    { toast("The new passwords don't match", "error"); return; }
    if (fresh.length < 6)   { toast("Use at least 6 characters", "error"); return; }

    try {
        await apiFetch("/users/change-password", {
            method: "POST",
            body: JSON.stringify({ current, new: fresh })
        });
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

/* ============================================================
   INIT
============================================================ */
async function initApp() {
    await fetchParts();
    if (isAdmin()) checkStorage();
}

async function fetchParts() {
    try {
        state.parts = await apiFetch("/parts");
        renderAll();
    } catch (err) {
        toast(err.message || "Inventory load failed", "error");
    }
}

function renderAll() {
    renderInventory();
    renderDashboard();
    populateSaleDropdown();
    renderCart();
    updateLowBadge();
}

/* ============================================================
   STATUS HELPER
============================================================ */
function getStatus(p) {
    if (!p || p.qty <= 0)        return "out";
    if (p.qty <= (p.min ?? 5))   return "low";
    return "ok";
}

/* ============================================================
   DASHBOARD
============================================================ */
function renderDashboard() {
    const grid = $("statsGrid");
    if (!grid) return;

    const total      = state.parts.length;
    const lowCount   = state.parts.filter(p => getStatus(p) === "low").length;
    const outCount   = state.parts.filter(p => getStatus(p) === "out").length;
    const totalValue = state.parts.reduce((s, p) => s + p.price * p.qty, 0);

    grid.innerHTML = `
        <div class="stat-card blue">
            <div class="s-label">Total Parts</div>
            <div class="s-value">${total}</div>
            <div class="s-sub">items in catalog</div>
        </div>
        <div class="stat-card amber">
            <div class="s-label">Low Stock</div>
            <div class="s-value">${lowCount}</div>
            <div class="s-sub">need restocking</div>
        </div>
        <div class="stat-card red">
            <div class="s-label">Out of Stock</div>
            <div class="s-value">${outCount}</div>
            <div class="s-sub">unavailable</div>
        </div>
        <div class="stat-card green">
            <div class="s-label">Stock Value</div>
            <div class="s-value" style="font-size:clamp(14px, 3.5vw, 28px);word-break:break-all;">${naira(totalValue)}</div>
            <div class="s-sub">at selling price</div>
        </div>
    `;
}

// Today's sales on the dashboard (from the server, so it survives refreshes)
async function loadTodaySummary() {
    const list = $("activityList");
    if (!list) return;
    try {
        const { sales } = await apiFetch(`/sales?date=${todayLocal()}`);
        const total = sales.reduce((s, x) => s + x.total, 0);
        $("todayHeading").textContent = (isAdmin() ? "Today's Sales" : "Your Sales Today") +
            ` — ${sales.length} sale(s), ${naira(total)}`;

        if (!sales.length) {
            list.innerHTML = `<div class="activity-row"><div class="activity-text muted-center">No sales recorded today yet.</div></div>`;
            return;
        }
        list.innerHTML = sales.slice(0, 10).map(s => `
            <div class="activity-row clickable" onclick="viewReceipt(${s.id})">
                <div class="activity-icon ai-sale"><i class="fa-solid fa-receipt"></i></div>
                <div class="activity-text">
                    <strong>${esc(s.receipt_no)}</strong> — ${s.item_count} item(s), ${naira(s.total)}
                    <span class="muted-small">by ${esc(s.username)}${s.customer ? " · " + esc(s.customer) : ""}</span>
                </div>
                <div class="activity-time">${esc(s.created_at.slice(11, 16))}</div>
            </div>`).join("");
    } catch (_) {
        list.innerHTML = `<div class="activity-row"><div class="activity-text muted-center">Couldn't load today's sales.</div></div>`;
    }
}

/* ============================================================
   AUDIT LOG (admin only)
============================================================ */
async function loadAuditLog() {
    const tbody = $("auditTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="muted-center" style="padding:20px;">Loading...</td></tr>`;

    try {
        const { logs } = await apiFetch("/audit?limit=200");
        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="muted-center" style="padding:20px;">No audit records yet.</td></tr>`;
            return;
        }
        const actionLabels = {
            SALE:            { label: "Sale",            color: "var(--out)",     icon: "fa-arrow-down" },
            RESTOCK:         { label: "Restock",         color: "var(--ok)",      icon: "fa-arrow-up" },
            ADJUST:          { label: "Stock Corrected", color: "var(--low)",     icon: "fa-scale-balanced" },
            ADD_PART:        { label: "Added Part",      color: "var(--accent2)", icon: "fa-plus" },
            EDIT_PART:       { label: "Edited Part",     color: "var(--accent2)", icon: "fa-pen" },
            DELETE_PART:     { label: "Deleted Part",    color: "var(--out)",     icon: "fa-trash" },
            ADD_USER:        { label: "Added User",      color: "var(--accent2)", icon: "fa-user-plus" },
            DELETE_USER:     { label: "Removed User",    color: "var(--out)",     icon: "fa-user-minus" },
            CHANGE_PASSWORD: { label: "Password Change", color: "var(--muted)",   icon: "fa-key" },
        };
        tbody.innerHTML = logs.map(l => {
            const a = actionLabels[l.action] || { label: l.action, color: "var(--muted)", icon: "fa-circle" };
            const change = l.qty_change != null
                ? `<span style="color:${l.qty_change < 0 ? "var(--out)" : "var(--ok)"}">${l.qty_change > 0 ? "+" : ""}${l.qty_change}</span>`
                : "—";
            return `
            <tr>
                <td style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${esc(l.created_at)}</td>
                <td><span style="color:${a.color};font-size:12px;"><i class="fa-solid ${a.icon}" style="margin-right:6px;"></i>${a.label}</span></td>
                <td><strong>${esc(l.username)}</strong></td>
                <td>${esc(l.part_name || "—")}</td>
                <td style="font-family:var(--font-mono)">${change}</td>
                <td style="font-size:12px;color:var(--muted)">${esc(l.note || "—")}</td>
            </tr>`;
        }).join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--out);padding:20px;">${esc(err.message)}</td></tr>`;
    }
}

/* ============================================================
   INVENTORY
============================================================ */
function renderInventory(parts = null) {
    const tbody = $("partsTableBody");
    const empty = $("emptyState");
    if (!tbody) return;

    const list = parts ?? state.parts;
    if (!list.length) {
        tbody.innerHTML = "";
        if (empty) empty.style.display = "block";
        return;
    }
    if (empty) empty.style.display = "none";

    const labels = { ok: "In Stock", low: "Low", out: "Out" };
    tbody.innerHTML = list.map(p => {
        const s = getStatus(p);
        return `
        <tr>
            <td>
                <div class="part-name">${esc(p.name)}</div>
                <div class="part-sku">${esc(p.sku)}</div>
            </td>
            <td>${p.qty}</td>
            <td><span class="qty-badge s-${s}"><span class="status-dot"></span>${labels[s]}</span></td>
            <td class="price-cell">${naira(p.price)}${isAdmin() && p.cost ? `<div class="part-sku">cost ${naira(p.cost)}</div>` : ""}</td>
            <td class="action-cell">
                <button class="btn-sm btn-restock" onclick="openRestockModal(${p.id})">
                    <i class="fa-solid fa-arrow-up"></i> Restock
                </button>
                ${isAdmin() ? `
                <button class="btn-sm btn-restock" title="Edit price, cost or stock" onclick="openEditModal(${p.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-sm btn-delete" title="Delete" onclick="deletePart(${p.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ""}
            </td>
        </tr>`;
    }).join("");
}

function setFilter(filter, btn) {
    state.currentFilter = filter;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    applyFilterAndSearch();
}
function filterParts() { applyFilterAndSearch(); }

function applyFilterAndSearch() {
    const q = $("searchInput")?.value?.toLowerCase().trim() || "";
    let filtered = state.parts;
    if (state.currentFilter !== "all") filtered = filtered.filter(p => getStatus(p) === state.currentFilter);
    if (q) filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
        || (p.barcode || "").toLowerCase().includes(q) || shopCode(p.id).toLowerCase() === q);
    renderInventory(filtered);
}

function updateLowBadge() {
    const count = state.parts.filter(p => getStatus(p) !== "ok").length;
    ["lowBadge", "mLowBadge"].forEach(id => {
        const b = $(id);
        if (b) { b.textContent = count; b.style.display = count > 0 ? "inline" : "none"; }
    });
}

/* ============================================================
   NEW SALE — CART
============================================================ */
function cartQtyFor(partId) {
    return state.cart.filter(c => c.part_id === partId).reduce((s, c) => s + c.qty, 0);
}

function populateSaleDropdown() {
    const select = $("salePart");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">— Choose a part —</option>` +
        state.parts.map(p => {
            const left = p.qty - cartQtyFor(p.id);
            return `<option value="${p.id}" ${left <= 0 ? "disabled" : ""} ${String(p.id) === current ? "selected" : ""}>${esc(p.name)} (${esc(p.sku)}) — ${left} left · ${naira(p.price)}</option>`;
        }).join("");
    updateSalePreview();
}

function updateSalePreview() {
    const id      = parseInt($("salePart")?.value);
    const qty     = parseInt($("saleQty")?.value);
    const preview = $("salePreview");
    const part    = state.parts.find(p => p.id === id);
    if (!part) { if (preview) preview.style.display = "none"; return; }
    if (preview) preview.style.display = "block";

    const left = part.qty - cartQtyFor(part.id);
    $("spName").textContent  = part.name;
    $("spPrice").textContent = naira(part.price);
    $("spStock").textContent = `${left} units`;

    const t = $("spTotal");
    if (!isNaN(qty) && qty > 0) {
        const over = qty > left;
        t.textContent = over ? "⚠ Not enough stock" : naira(qty * part.price);
        t.style.color = over ? "var(--out)" : "var(--ok)";
    } else {
        t.textContent = "—";
        t.style.color = "var(--ok)";
    }
}

function addToCart() {
    const id   = parseInt($("salePart")?.value);
    const qty  = parseInt($("saleQty")?.value);
    const part = state.parts.find(p => p.id === id);

    if (!part || isNaN(qty) || qty <= 0) { toast("Pick a part and enter a quantity", "error"); return; }
    const left = part.qty - cartQtyFor(part.id);
    if (qty > left) { toast(`Only ${left} ${part.name} left`, "error"); return; }

    const line = state.cart.find(c => c.part_id === id);
    if (line) line.qty += qty; else state.cart.push({ part_id: id, qty });

    $("saleQty").value = "";
    $("salePart").value = "";
    renderCart();
    populateSaleDropdown();
}

function removeFromCart(partId) {
    state.cart = state.cart.filter(c => c.part_id !== partId);
    renderCart();
    populateSaleDropdown();
}

function renderCart() {
    const box = $("cartList");
    if (!box) return;
    state.cart = state.cart.filter(c => state.parts.some(p => p.id === c.part_id));

    if (!state.cart.length) {
        box.innerHTML = `<div class="cart-empty">No items yet. Choose a part above and tap “Add to sale”.</div>`;
        $("cartTotal").textContent = naira(0);
        $("completeSaleBtn").disabled = true;
        return;
    }
    let total = 0;
    box.innerHTML = state.cart.map(c => {
        const p = state.parts.find(x => x.id === c.part_id);
        const line = c.qty * p.price;
        total += line;
        return `
        <div class="cart-line">
            <div class="cart-line-main">
                <strong>${esc(p.name)}</strong>
                <span class="muted-small">${c.qty} × ${naira(p.price)}</span>
            </div>
            <div class="qty-step">
                <button onclick="changeCartQty(${p.id}, -1)" aria-label="One less">−</button>
                <span>${c.qty}</span>
                <button onclick="changeCartQty(${p.id}, 1)" aria-label="One more">+</button>
            </div>
            <div class="cart-line-total">${naira(line)}</div>
        </div>`;
    }).join("");
    $("cartTotal").textContent = naira(total);
    $("completeSaleBtn").disabled = false;
}

async function completeSale() {
    if (!state.cart.length) return;
    if (!state.payMethod) { toast("Choose how the customer paid: Cash, POS or Transfer", "error"); return; }
    const btn = $("completeSaleBtn");
    btn.disabled = true;
    try {
        const sale = await apiFetch("/sales", {
            method: "POST",
            body: JSON.stringify({ items: state.cart, customer: $("saleCustomer").value.trim(), payment_method: state.payMethod })
        });
        state.cart = [];
        $("saleCustomer").value = "";
        setPayMethod(null);
        toast(`Sale saved — ${sale.receipt_no}`, "success");
        await fetchParts();
        loadSalesHistory();
        showReceipt(sale);
    } catch (err) {
        toast(err.message || "Sale failed — try again", "error");
        await fetchParts();         // stock may have changed on another device
    } finally {
        btn.disabled = !state.cart.length;
    }
}

/* ============================================================
   SALES HISTORY & RECEIPTS
============================================================ */
async function loadSalesHistory() {
    const dateEl = $("historyDate");
    if (dateEl && !dateEl.value) dateEl.value = todayLocal();
    const tbody = $("salesHistoryBody");
    if (!tbody) return;
    try {
        const { sales } = await apiFetch(`/sales?date=${dateEl.value}`);
        const total = sales.reduce((s, x) => s + x.total, 0);
        $("historySummary").textContent = `${sales.length} sale(s) · ${naira(total)}`;
        tbody.innerHTML = sales.length ? sales.map(s => `
            <tr class="clickable" onclick="viewReceipt(${s.id})">
                <td style="font-family:var(--font-mono);font-size:12px;">${esc(s.receipt_no)}</td>
                <td style="font-size:12px;color:var(--muted)">${esc(s.created_at.slice(11, 16))}</td>
                <td>${esc(s.customer || "—")}</td>
                <td>${esc(s.username)}</td>
                <td>${naira(s.total)}<div class="part-sku">${esc(PAY_LABELS[s.payment_method] || "")}</div></td>
            </tr>`).join("")
            : `<tr><td colspan="5" class="muted-center" style="padding:20px;">No sales on this day.</td></tr>`;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--out);padding:20px;">${esc(err.message)}</td></tr>`;
    }
}

async function viewReceipt(id) {
    try {
        showReceipt(await apiFetch(`/sales/${id}`));
    } catch (err) {
        toast(err.message, "error");
    }
}

function showReceipt(sale) {
    state.lastReceipt = sale;
    $("receiptBody").innerHTML = `
        <div class="rc-shop">SpareParts Pro</div>
        <div class="rc-meta">
            <div><span>Receipt</span><strong>${esc(sale.receipt_no)}</strong></div>
            <div><span>Date</span><strong>${esc(sale.created_at)}</strong></div>
            <div><span>Served by</span><strong>${esc(sale.username)}</strong></div>
            ${sale.customer ? `<div><span>Customer</span><strong>${esc(sale.customer)}</strong></div>` : ""}
            <div><span>Paid by</span><strong>${esc(PAY_LABELS[sale.payment_method] || "Cash")}</strong></div>
        </div>
        <table class="rc-items">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
                ${sale.items.map(i => `
                <tr>
                    <td>${esc(i.part_name)}<div class="rc-sku">${esc(i.sku || "")}</div></td>
                    <td>${i.qty}</td>
                    <td>${naira(i.unit_price)}</td>
                    <td>${naira(i.line_total)}</td>
                </tr>`).join("")}
            </tbody>
        </table>
        <div class="rc-total"><span>TOTAL</span><strong>${naira(sale.total)}</strong></div>
        <div class="rc-thanks">Thank you for your patronage</div>
    `;
    openModal("receiptModal");
}

function printReceipt() {
    document.body.classList.add("printing-receipt");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-receipt"), 500);
}

function shareReceipt() {
    const s = state.lastReceipt;
    if (!s) return;
    const text = [
        `SpareParts Pro — Receipt ${s.receipt_no}`,
        s.created_at,
        s.customer ? `Customer: ${s.customer}` : null,
        `Paid by: ${PAY_LABELS[s.payment_method] || "Cash"}`,
        "",
        ...s.items.map(i => `${i.part_name} x${i.qty} — ${naira(i.line_total)}`),
        "",
        `TOTAL: ${naira(s.total)}`,
        "Thank you for your patronage"
    ].filter(l => l !== null).join("\n");

    if (navigator.share) {
        navigator.share({ title: `Receipt ${s.receipt_no}`, text }).catch(() => {});
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
}

/* ============================================================
   DAILY REPORT (admin)
============================================================ */
async function loadReport() {
    const dateEl = $("reportDate");
    if (!dateEl.value) dateEl.value = todayLocal();
    const out = $("reportBody");
    out.innerHTML = `<p class="muted-center" style="padding:20px;">Loading...</p>`;
    try {
        const r = await apiFetch(`/reports/daily?date=${dateEl.value}`);
        const max = Math.max(...r.last7.map(d => d.revenue), 1);
        const dayName = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
        const big = "font-size:clamp(14px,3.5vw,26px);word-break:break-all;";

        out.innerHTML = `
        <div class="stat-grid">
            <div class="stat-card green">
                <div class="s-label">Sales</div>
                <div class="s-value" style="${big}">${naira(r.revenue)}</div>
                <div class="s-sub">${r.sales} sale(s)</div>
            </div>
            <div class="stat-card blue">
                <div class="s-label">Items Sold</div>
                <div class="s-value">${r.items}</div>
                <div class="s-sub">units</div>
            </div>
            <div class="stat-card amber">
                <div class="s-label">Profit</div>
                <div class="s-value" style="${big}">${naira(r.profit)}</div>
                <div class="s-sub">${r.missing_cost_lines ? `${r.missing_cost_lines} line(s) missing cost price` : "after cost of parts"}</div>
            </div>
            <div class="stat-card red">
                <div class="s-label">Avg. Sale</div>
                <div class="s-value" style="${big}">${naira(r.sales ? r.revenue / r.sales : 0)}</div>
                <div class="s-sub">per customer</div>
            </div>
        </div>

        ${r.missing_cost_lines ? `<div class="report-note"><i class="fa-solid fa-circle-info"></i>
            Profit only counts parts that have a cost price. Add cost prices with the <i class="fa-solid fa-pen"></i> button in Inventory to see your full profit.</div>` : ""}

        <div class="section-title">End-of-Day Money Check</div>
        ${renderCloseDay(r)}

        <div class="section-title">Last 7 Days</div>
        <div class="bars">
            ${r.last7.map(d => `
            <div class="bar-col" title="${esc(d.date)}: ${naira(d.revenue)}">
                <div class="bar-val">${d.revenue ? Number(d.revenue).toLocaleString() : ""}</div>
                <div class="bar-track"><div class="bar" style="height:${Math.round((d.revenue / max) * 100)}%"></div></div>
                <div class="bar-day ${d.date === r.date ? "on" : ""}">${dayName(d.date)}</div>
            </div>`).join("")}
        </div>

        <div class="report-cols">
            <div>
                <div class="section-title">Best-Selling Parts</div>
                <table class="parts-table">
                    <thead><tr><th>Part</th><th>Qty</th><th>Amount</th></tr></thead>
                    <tbody>${r.top_parts.length ? r.top_parts.map(p => `
                        <tr><td><div class="part-name">${esc(p.part_name)}</div><div class="part-sku">${esc(p.sku || "")}</div></td>
                            <td>${p.qty}</td><td>${naira(p.revenue)}</td></tr>`).join("")
                        : `<tr><td colspan="3" class="muted-center" style="padding:16px;">No sales.</td></tr>`}</tbody>
                </table>
            </div>
            <div>
                <div class="section-title">Sales by Staff</div>
                <table class="parts-table">
                    <thead><tr><th>Staff</th><th>Sales</th><th>Amount</th></tr></thead>
                    <tbody>${r.by_staff.length ? r.by_staff.map(s => `
                        <tr><td><strong>${esc(s.username)}</strong></td><td>${s.sales}</td><td>${naira(s.revenue)}</td></tr>`).join("")
                        : `<tr><td colspan="3" class="muted-center" style="padding:16px;">No sales.</td></tr>`}</tbody>
                </table>
            </div>
        </div>`;
    } catch (err) {
        out.innerHTML = `<p style="color:var(--out);padding:20px;">${esc(err.message)}</p>`;
    }
}

/* ============================================================
   RESTOCK
============================================================ */
function openRestockModal(id) {
    const part = state.parts.find(p => p.id === id);
    if (!part) return;
    state.restockTargetId = id;
    $("restockPartName").textContent = `${part.name}  ·  Current stock: ${part.qty}`;
    $("restockQty").value = "";
    openModal("restockModal");
}

async function confirmRestock() {
    const qty  = parseInt($("restockQty")?.value);
    if (isNaN(qty) || qty <= 0) { toast("Enter a valid quantity", "error"); return; }
    const part = state.parts.find(p => p.id === state.restockTargetId);
    if (!part) return;
    try {
        await apiFetch(`/parts/${part.id}/restock`, { method: "POST", body: JSON.stringify({ qty }) });
        toast(`+${qty} added to ${part.name}`, "success");
        closeModal("restockModal");
        await fetchParts();
    } catch (err) {
        toast(err.message || "Restock failed — try again", "error");
    }
}

/* ============================================================
   ADD PART (admin)
============================================================ */
function openAddModal() {
    if (!isAdmin()) { toast("Admin access required", "error"); return; }
    ["newName", "newSku", "newBarcode", "newQty", "newPrice", "newCost"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    $("newMin").value = 5;
    openModal("addModal");
}

async function confirmAddPart() {
    const name  = $("newName").value.trim();
    const sku   = $("newSku").value.trim();
    const qty   = parseInt($("newQty").value || "0");
    const min   = parseInt($("newMin").value || "5");
    const price = parseFloat($("newPrice").value);
    const cost  = parseFloat($("newCost").value || "0");

    if (!name || !sku)              { toast("Name and SKU are required", "error"); return; }
    if (isNaN(qty) || qty < 0)      { toast("Enter a valid quantity", "error"); return; }
    if (isNaN(min) || min < 0)      { toast("Enter a valid minimum stock", "error"); return; }
    if (isNaN(price) || price < 0)  { toast("Enter a valid selling price", "error"); return; }
    if (isNaN(cost) || cost < 0)    { toast("Enter a valid cost price", "error"); return; }
    if (cost > price && !confirm("Cost is higher than selling price. Save anyway?")) return;

    try {
        const barcode = $("newBarcode").value.trim();
        await apiFetch("/parts", { method: "POST", body: JSON.stringify({ name, sku, barcode, qty, min, price, cost }) });
        toast(`${name} added to inventory`, "success");
        closeModal("addModal");
        await fetchParts();
    } catch (err) {
        toast(err.message || "Failed to add part", "error");
    }
}

/* ============================================================
   EDIT PART (admin) — details + stock correction
============================================================ */
function openEditModal(id) {
    const p = state.parts.find(x => x.id === id);
    if (!p) return;
    state.editTargetId = id;
    $("editName").value   = p.name;
    $("editSku").value    = p.sku;
    $("editBarcode").value = p.barcode || "";
    $("editShopCode").textContent = shopCode(p.id);
    $("editPrice").value  = p.price;
    $("editCost").value   = p.cost || "";
    $("editMin").value    = p.min;
    $("editQty").value    = p.qty;
    $("editReason").value = "";
    openModal("editModal");
}

async function confirmEditPart() {
    const p = state.parts.find(x => x.id === state.editTargetId);
    if (!p) return;
    const body = {
        name:  $("editName").value.trim(),
        sku:   $("editSku").value.trim(),
        price: parseFloat($("editPrice").value),
        cost:  parseFloat($("editCost").value || "0"),
        min:   parseInt($("editMin").value),
        barcode: $("editBarcode").value.trim()
    };
    const newQty = parseInt($("editQty").value);
    const reason = $("editReason").value.trim();

    if (!body.name || !body.sku)             { toast("Name and SKU are required", "error"); return; }
    if (isNaN(body.price) || body.price < 0) { toast("Enter a valid selling price", "error"); return; }
    if (isNaN(body.cost)  || body.cost  < 0) { toast("Enter a valid cost price", "error"); return; }
    if (isNaN(body.min)   || body.min   < 0) { toast("Enter a valid minimum stock", "error"); return; }
    if (isNaN(newQty) || newQty < 0)         { toast("Enter a valid stock quantity", "error"); return; }
    if (newQty !== p.qty && !reason)         { toast("Say why the stock count changed", "error"); return; }

    try {
        await apiFetch(`/parts/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        if (newQty !== p.qty)
            await apiFetch(`/parts/${p.id}/adjust`, { method: "POST", body: JSON.stringify({ qty: newQty, reason }) });
        toast(`${body.name} updated`, "success");
        closeModal("editModal");
        await fetchParts();
    } catch (err) {
        toast(err.message || "Update failed", "error");
        await fetchParts();
    }
}

/* ============================================================
   DELETE PART (admin)
============================================================ */
async function deletePart(id) {
    const p = state.parts.find(x => x.id === id);
    if (!p || !confirm(`Remove "${p.name}" from inventory? This cannot be undone.`)) return;
    try {
        await apiFetch(`/parts/${id}`, { method: "DELETE" });
        toast(`${p.name} removed`, "info");
        await fetchParts();
    } catch (err) {
        toast(err.message || "Delete failed", "error");
    }
}

/* ============================================================
   NAVIGATION
============================================================ */
function showSection(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-btn, .mobile-nav-btn").forEach(b => b.classList.remove("active"));
    $(id)?.classList.add("active");
    document.querySelector(`.nav-btn[data-section="${id}"]`)?.classList.add("active");
    document.querySelector(`.mobile-nav-btn[data-section="${id}"]`)?.classList.add("active");

    if (id === "dashboard") loadTodaySummary();
    if (id === "sales")     loadSalesHistory();
    if (id === "reports")   loadReport();
    if (id === "labels")    renderLabelPicker();
    if (id !== "sales")     stopScanner();
    if (id === "audit")     loadAuditLog();
    if (id === "users")     { loadUsers(); checkStorage(); }
    window.scrollTo(0, 0);
}

/* ============================================================
   MODALS
============================================================ */
function openModal(id) { $(id)?.classList.add("open"); }
function closeModal(id, force = false) {
    const m = $(id);
    if (!m) return;
    if (!force && m.dataset.forced === "1") return;   // a required password change can't be skipped
    m.dataset.forced = "";
    m.classList.remove("open");
}
document.addEventListener("click", e => {
    if (e.target.classList.contains("modal-overlay")) closeModal(e.target.id);
});

/* ============================================================
   USER MANAGEMENT (admin)
============================================================ */
async function loadUsers() {
    const list = $("usersList");
    if (!list) return;
    try {
        const users = await apiFetch("/users");
        state.users = users;
        list.innerHTML = `
        <table class="parts-table">
            <thead><tr><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
                ${users.map(u => `
                <tr>
                    <td><strong>${esc(u.username)}</strong></td>
                    <td><span style="font-family:var(--font-mono);font-size:11px;color:${u.role === "admin" ? "var(--accent2)" : "var(--muted)"}">${esc(u.role.toUpperCase())}</span></td>
                    <td>
                        ${u.id !== state.user.id ? `
                        <button class="btn-sm btn-delete" onclick="deleteUser(${u.id})">
                            <i class="fa-solid fa-trash"></i> Remove
                        </button>` : `<span style="color:var(--muted);font-size:12px;">You</span>`}
                    </td>
                </tr>`).join("")}
            </tbody>
        </table>`;
    } catch (err) {
        list.innerHTML = `<p style="color:var(--out);padding:20px;">${esc(err.message)}</p>`;
    }
}

function openAddUserModal() {
    ["newUserName", "newUserPass"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    openModal("addUserModal");
}

async function confirmAddUser() {
    const username = $("newUserName").value.trim();
    const password = $("newUserPass").value;
    const role     = $("newUserRole").value || "staff";
    if (!username || !password) { toast("Username and password required", "error"); return; }
    if (password.length < 6)    { toast("Password must be at least 6 characters", "error"); return; }
    try {
        await apiFetch("/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
        toast(`${username} added. They'll pick their own password at first sign-in.`, "success");
        closeModal("addUserModal");
        loadUsers();
    } catch (err) {
        toast(err.message || "Failed to add user", "error");
    }
}

async function deleteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u || !confirm(`Remove "${u.username}"? They won't be able to sign in.`)) return;
    try {
        await apiFetch(`/users/${id}`, { method: "DELETE" });
        toast(`${u.username} removed`, "info");
        loadUsers();
    } catch (err) {
        toast(err.message || "Failed to remove user", "error");
    }
}


/* ============================================================
   BARCODES — lookup
============================================================ */
const PAY_LABELS = { cash: "Cash", pos: "POS", transfer: "Transfer" };

// Every part answers to its own shop code even without a manufacturer barcode.
// It's an EAN-13 starting "200" — GS1 keeps 20-29 for a shop's own items, so it never clashes
// with real product barcodes, and EAN-13 is the easiest format for phone cameras to read.
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
        || state.parts.find(p => shopCode(p.id).toLowerCase() === code)
        || null;
}

// Typed code or a plug-in (USB/Bluetooth) scanner, which "types" the code then presses Enter
function handleScanInput(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const box = $("scanInput");
    addByCode(box.value);
    box.value = "";
}

function addByCode(code) {
    const part = findPartByCode(code);
    if (!part) {
        beep(false);
        toast(`No part has the code "${code}". Add it to the part with the pencil button in Inventory.`, "error");
        return false;
    }
    const left = part.qty - cartQtyFor(part.id);
    if (left <= 0) { beep(false); toast(`${part.name} is out of stock`, "error"); return false; }

    const line = state.cart.find(c => c.part_id === part.id);
    if (line) line.qty += 1; else state.cart.push({ part_id: part.id, qty: 1 });
    beep(true);
    toast(`+1 ${part.name}`, "success");
    renderCart();
    populateSaleDropdown();
    return true;
}

function changeCartQty(partId, delta) {
    const line = state.cart.find(c => c.part_id === partId);
    const part = state.parts.find(p => p.id === partId);
    if (!line || !part) return;
    const next = line.qty + delta;
    if (next <= 0) { removeFromCart(partId); return; }
    if (next > part.qty) { toast(`Only ${part.qty} ${part.name} in stock`, "error"); return; }
    line.qty = next;
    renderCart();
    populateSaleDropdown();
}

function setPayMethod(m) {
    state.payMethod = m;
    document.querySelectorAll(".pay-btn").forEach(b => b.classList.toggle("active", b.dataset.method === m));
}

let audioCtx;
function beep(ok) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = ok ? 1250 : 300;
        g.gain.value = 0.08;
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25));
    } catch (_) {}
    try { navigator.vibrate?.(ok ? 40 : [80, 60, 80]); } catch (_) {}
}

/* ============================================================
   CAMERA SCANNER (phone or laptop camera)
============================================================ */
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

// target: "sale" (keeps scanning, adds to cart) | "newBarcode" | "editBarcode" (fills the field, then closes)
async function openScanner(target) {
    state.scanTarget = target;
    lastScan = { code: "", at: 0 };
    $("scanHint").textContent = target === "sale"
        ? "Point the camera at a barcode. Each beep adds 1 to the sale."
        : "Point the camera at the barcode on the part.";
    $("scannerModal").classList.add("open");

    if (!window.isSecureContext) {
        $("scanStatus").textContent = "The camera only works when the app is opened over https:// (or on this computer).";
        return;
    }
    $("scanStatus").textContent = "Starting camera...";
    try {
        await loadScript(SCANNER_LIB);
        const F = Html5QrcodeSupportedFormats;
        scanner = new Html5Qrcode("scanView", {
            formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE],
            useBarCodeDetectorIfSupported: true,
            verbose: false
        });
        await scanner.start(
            { facingMode: "environment" },
            { fps: 12 },   // read the whole picture: a cropped scan box cut off the edges of wide labels
            onScan,
            () => {}
        );
        $("scanStatus").textContent = "";
    } catch (err) {
        const msg = String(err?.message || err);
        $("scanStatus").textContent = /Permission|NotAllowed/i.test(msg)
            ? "Camera permission was blocked. Allow camera access for this site in your browser settings."
            : /NotFound|Requested device not found/i.test(msg)
                ? "No camera found on this device. Type the code or use a plug-in scanner instead."
                : msg;
        await stopScanner(true);
    }
}

function onScan(text) {
    // The camera reads ~12 times a second. A code only counts again after it has left
    // the view for over 1.2s, so holding a part steady never adds it twice.
    const now = Date.now();
    const sameStillInView = text === lastScan.code && now - lastScan.at < 1200;
    lastScan = { code: text, at: now };
    if (sameStillInView) return;

    if (state.scanTarget === "sale") {
        addByCode(text);
        return;
    }
    const field = state.scanTarget === "editBarcode" ? $("editBarcode") : $("newBarcode");
    if (field) field.value = text;
    beep(true);
    closeScanner();
}

async function stopScanner(keepOpen = false) {
    if (scanner) {
        try { if (scanner.isScanning) await scanner.stop(); } catch (_) {}
        try { scanner.clear(); } catch (_) {}
        scanner = null;
    }
    if (!keepOpen) $("scannerModal")?.classList.remove("open");
}
function closeScanner() { stopScanner(false); }

/* ============================================================
   LABELS (admin) — print on plain A4 now, A4 sticker sheets later
============================================================ */
function renderLabelPicker() {
    const q = ($("labelSearch")?.value || "").toLowerCase().trim();
    const list = state.parts.filter(p => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    $("labelTableBody").innerHTML = list.length ? list.map(p => `
        <tr>
            <td><div class="part-name">${esc(p.name)}</div><div class="part-sku">${esc(p.sku)}</div></td>
            <td style="font-family:var(--font-mono);font-size:12px;">${esc(p.barcode || shopCode(p.id))}
                <div class="part-sku">${p.barcode ? "own barcode" : "shop code"}</div></td>
            <td>${p.qty}</td>
            <td><input type="number" min="0" max="500" class="copies-input" value="${state.labelCopies[p.id] || 0}"
                       oninput="setLabelCopies(${p.id}, this.value)"></td>
        </tr>`).join("")
        : `<tr><td colspan="4" class="muted-center" style="padding:20px;">No parts found.</td></tr>`;
    updateLabelCount();
}

function setLabelCopies(id, v) {
    const n = Math.max(0, Math.min(500, parseInt(v) || 0));
    if (n) state.labelCopies[id] = n; else delete state.labelCopies[id];
    updateLabelCount();
}

function labelsMatchStock() {
    state.parts.forEach(p => { if (p.qty > 0) state.labelCopies[p.id] = Math.min(p.qty, 500); else delete state.labelCopies[p.id]; });
    renderLabelPicker();
}
function clearLabels() { state.labelCopies = {}; renderLabelPicker(); }

function updateLabelCount() {
    const total = Object.values(state.labelCopies).reduce((s, n) => s + n, 0);
    const sheets = Math.ceil(total / 21);
    $("labelCount").textContent = total ? `${total} label(s) · ${sheets} A4 page(s)` : "No labels chosen";
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

    try { await loadScript(LABEL_LIB); }
    catch (err) { toast(err.message, "error"); return; }

    const sheet = $("labelSheet");
    sheet.innerHTML = items.map((p, i) => `
        <div class="label">
            <div class="lb-name">${esc(p.name)}</div>
            <svg class="lb-code" id="lb${i}"></svg>
            <div class="lb-foot"><span>${esc(p.sku)}</span>${showPrice ? `<strong>${naira(p.price)}</strong>` : ""}</div>
        </div>`).join("");

    items.forEach((p, i) => {
        const value = p.barcode || shopCode(p.id);
        const isEan = /^\d{13}$/.test(value) || /^\d{8}$/.test(value);
        try {
            JsBarcode(`#lb${i}`, value, { format: isEan ? (value.length === 13 ? "EAN13" : "EAN8") : "CODE128",
                height: 50, width: 2, fontSize: 13, margin: 12, displayValue: true });   // margin = blank "quiet zone" scanners need
        } catch (_) {
            JsBarcode(`#lb${i}`, value, { format: "CODE128", height: 42, width: 1.6, fontSize: 12, margin: 12 });
        }
    });

    document.body.classList.add("printing-labels");
    setTimeout(() => {
        window.print();
        setTimeout(() => document.body.classList.remove("printing-labels"), 500);
    }, 150);
}

/* ============================================================
   END-OF-DAY MONEY CHECK (inside Daily Report)
============================================================ */
function renderCloseDay(r) {
    const exp = r.by_method;
    const c = r.close;
    const row = (label, expected, counted) => {
        const diff = counted == null ? null : counted - expected;
        const cls = diff == null ? "" : diff === 0 ? "ok" : diff < 0 ? "short" : "over";
        const txt = diff == null ? "—" : diff === 0 ? "Matches" : (diff < 0 ? "Short " : "Over ") + naira(Math.abs(diff));
        return `<tr><td>${label}</td><td>${naira(expected)}</td><td>${counted == null ? "—" : naira(counted)}</td>
                <td><span class="diff ${cls}">${txt}</span></td></tr>`;
    };
    return `
    <div class="close-card">
        <p class="muted-small" style="margin:0 0 12px;">Count the cash in the drawer, check the POS terminal's end-of-day total and your bank app for
           transfers, then enter what you actually have. Any gap means a sale was missed, recorded wrongly, or money is missing.</p>
        <table class="parts-table close-table">
            <thead><tr><th>Payment</th><th>App says</th><th>You counted</th><th>Difference</th></tr></thead>
            <tbody>
                ${row("Cash", exp.cash, c?.cash_counted)}
                ${row("POS", exp.pos, c?.pos_total)}
                ${row("Transfer", exp.transfer, c?.transfer_total)}
            </tbody>
        </table>
        <div class="form-row two-col three-col" style="margin-top:14px;">
            <div><label>Cash in drawer (₦)</label><input id="closeCash" type="number" min="0" inputmode="decimal" value="${c ? c.cash_counted : ""}"></div>
            <div><label>POS terminal total (₦)</label><input id="closePos" type="number" min="0" inputmode="decimal" value="${c ? c.pos_total : ""}"></div>
            <div><label>Transfers received (₦)</label><input id="closeTransfer" type="number" min="0" inputmode="decimal" value="${c ? c.transfer_total : ""}"></div>
        </div>
        <div class="form-row"><label>Note (optional)</label><input id="closeNote" maxlength="300" value="${esc(c?.note || "")}" placeholder="e.g. ₦2,000 given to driver for fuel"></div>
        <button class="btn-primary" onclick="saveCloseDay()"><i class="fa-solid fa-lock"></i> ${c ? "Update" : "Save"} day check</button>
        ${c ? `<p class="muted-small" style="margin:10px 0 0;">Last saved by ${esc(c.closed_by)} at ${esc(c.closed_at)}</p>` : ""}
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
    } catch (err) {
        toast(err.message, "error");
    }
}


/* ============================================================
   DATA SAFETY (admin) — storage warning + backup download
============================================================ */
async function checkStorage() {
    try {
        const st = await apiFetch("/admin/storage");
        const warn = $("storageWarn");
        if (warn) warn.style.display = st.permanent ? "none" : "flex";
        const info = $("backupInfo");
        if (info) info.textContent = st.permanent
            ? (st.latest_backup ? `Automatic daily copies: ${st.backups_kept} kept on the server (latest: ${st.latest_backup.replace("spareparts-", "").replace(".db", "")}).` : "Automatic daily copies start today.")
            : "Warning: the server is not saving data permanently yet. Download a backup now.";
    } catch (_) {}
}

async function downloadBackup() {
    try {
        const res = await fetch(`${BASE}/admin/backup`, { headers: { Authorization: `Bearer ${state.token}` } });
        if (!res.ok) throw new Error("Backup failed");
        const blob = await res.blob();
        const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "spareparts-backup.db";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast("Backup downloaded. Keep it somewhere safe, like Google Drive.", "success");
    } catch (err) {
        toast(err.message, "error");
    }
}

async function restoreBackup(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!confirm(`Replace ALL current data with "${file.name}"?\n\nToday's data is kept as a safety copy on the server, but the app will show only what is in this file.`)) return;
    try {
        const res = await fetch(`${BASE}/admin/restore`, {
            method: "POST",
            headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/octet-stream" },
            body: file
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Restore failed");
        toast(data.message, "success");
        setTimeout(() => signOutLocal("Backup restored. Sign in again (use the passwords from that backup)."), 2500);
    } catch (err) {
        toast(err.message, "error");
    }
}
