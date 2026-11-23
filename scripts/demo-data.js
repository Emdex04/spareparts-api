// Fills a SpareParts Pro server with realistic sample data for a demo, and (optionally) adds a reviewer's account.
// Safe to run more than once: parts, customers and sales that already exist are skipped.
//
//   node scripts/demo-data.js <server address> <owner username> <owner password> [reviewer username] [reviewer password]
//   e.g. node scripts/demo-data.js https://spareparts-api-4343.onrender.com admin MyPassword lecturer Review2026
//
// Customer phone numbers use the 0800 000 000x range, so no real person is ever messaged.
// Needs Node 18 or newer (it uses the built-in fetch).

const [server, ownerUser, ownerPass, reviewerUser, reviewerPass] = process.argv.slice(2);
if (!server || !ownerUser || !ownerPass) {
    console.log("Usage: node scripts/demo-data.js <server address> <owner username> <owner password> [reviewer username] [reviewer password]");
    process.exit(1);
}
const BASE = server.replace(/\/+$/, "") + "/api";
let token = "";

async function api(path, options = {}) {
    const res = await fetch(BASE + path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path}: ${data.message || res.status}`);
    return data;
}

// Shop time (Lagos, UTC+1) as "YYYY-MM-DD HH:MM:SS", `daysAgo` days back at a given hour
function stamp(daysAgo, hour, minute) {
    const d = new Date(Date.now() + 3600e3 - daysAgo * 86400e3);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString().replace("T", " ").slice(0, 19);
}

const PARTS = [
    // name, sku, qty, warn-at, selling price, cost price
    ["Brake pads (Toyota Corolla) front", "BP-COR-F", 24, 6, 18500, 13800],
    ["Oil filter (Toyota / Lexus)", "OF-TOY-01", 40, 10, 4500, 3100],
    ["Spark plug NGK (set of 4)", "SP-NGK-4", 30, 8, 14000, 10200],
    ["Engine oil 5W-30 (4 litres)", "EO-5W30-4", 36, 10, 28000, 22500],
    ["Air filter (Honda Accord)", "AF-ACC-08", 18, 5, 7500, 5200],
    ["Timing belt kit (Toyota Camry 2.4)", "TB-CAM-24", 8, 3, 42000, 31000],
    ["Shock absorber front (Corolla, pair)", "SA-COR-FP", 10, 3, 90000, 68000],
    ["Wheel bearing (front hub)", "WB-HUB-F", 14, 4, 15000, 10500],
    ["Alternator (Toyota Camry 2.4)", "ALT-CAM-24", 4, 2, 120000, 92000],
    ["Car battery 75Ah", "BAT-75AH", 9, 3, 95000, 78000],
    ["Radiator (Honda Civic)", "RAD-CIV-06", 5, 2, 85000, 64000],
    ["Clutch kit (Toyota Hilux)", "CK-HLX-01", 4, 2, 110000, 84000],
    ["Fuel pump (Nissan Almera)", "FP-ALM-01", 6, 2, 38000, 27500],
    ["Headlamp right (Toyota Corolla 2010)", "HL-COR-R", 3, 2, 55000, 41000],
    ["Wiper blades (pair)", "WP-PAIR-22", 25, 6, 6000, 3800],
    ["CV joint outer (Honda Accord)", "CV-ACC-OUT", 7, 3, 25000, 17500],
    ["Brake disc front (Corolla)", "BD-COR-F", 2, 4, 32000, 23500],
    ["Fan belt", "FB-STD-01", 20, 6, 5500, 3500],
    ["Gearbox automatic (Toyota Camry, used)", "GB-CAM-USED", 2, 1, 650000, 480000],
    ["Engine 2AZ (Toyota Camry 2.4, used)", "ENG-2AZ-USED", 2, 1, 1450000, 1100000]
];

const CUSTOMERS = [
    // name, phone, email, note
    ["Mr Emeka Okafor", "08000000001", "emeka.okafor@example.com", "Mechanic at Ladipo, buys for Toyota jobs"],
    ["Alhaji Musa Bello", "08000000002", "", "Fleet owner — 4 Hilux"],
    ["Mrs Funke Adeyemi", "08000000003", "funke.a@example.com", ""],
    ["Chinedu Motors", "08000000004", "chinedumotors@example.com", "Workshop, Ikeja"],
    ["Iya Bose", "08000000005", "", "Pays by transfer"],
    ["Mr Tunde Bakare", "08000000006", "", ""],
    ["Kelechi Auto Clinic", "08000000007", "kelechi.auto@example.com", "Regular, Honda specialist"]
];

// day, hour, minute, payment, customer index (or null = walk-in), [ [sku, qty], ... ]
const SALES = [
    [6, 9, 15, "cash", 0, [["BP-COR-F", 2], ["OF-TOY-01", 2]]],
    [6, 11, 40, "transfer", 3, [["SP-NGK-4", 1], ["EO-5W30-4", 2]]],
    [6, 15, 5, "pos", null, [["WP-PAIR-22", 1]]],
    [5, 10, 20, "transfer", 1, [["CK-HLX-01", 1], ["FB-STD-01", 2]]],
    [5, 13, 55, "cash", null, [["OF-TOY-01", 1], ["AF-ACC-08", 1]]],
    [5, 16, 30, "pos", 6, [["CV-ACC-OUT", 2], ["AF-ACC-08", 1]]],
    [4, 9, 50, "transfer", 2, [["BAT-75AH", 1]]],
    [4, 12, 10, "cash", 0, [["WB-HUB-F", 2], ["BP-COR-F", 1]]],
    [4, 14, 45, "transfer", 3, [["GB-CAM-USED", 1]]],
    [3, 10, 5, "cash", 4, [["EO-5W30-4", 1], ["OF-TOY-01", 1]]],
    [3, 11, 30, "pos", null, [["SP-NGK-4", 1]]],
    [3, 16, 15, "transfer", 1, [["SA-COR-FP", 1], ["WB-HUB-F", 1]]],
    [2, 9, 35, "cash", null, [["FB-STD-01", 1], ["WP-PAIR-22", 1]]],
    [2, 12, 50, "transfer", 6, [["TB-CAM-24", 1], ["EO-5W30-4", 1]]],
    [2, 15, 20, "pos", 5, [["FP-ALM-01", 1]]],
    [1, 10, 10, "transfer", 3, [["ENG-2AZ-USED", 1], ["TB-CAM-24", 1]]],
    [1, 13, 25, "cash", 0, [["BP-COR-F", 2], ["BD-COR-F", 1]]],
    [1, 17, 0, "pos", null, [["HL-COR-R", 1]]],
    [0, 9, 20, "cash", 2, [["OF-TOY-01", 2], ["AF-ACC-08", 1]]],
    [0, 10, 45, "transfer", 4, [["ALT-CAM-24", 1]]],
    [0, 11, 55, "pos", null, [["WP-PAIR-22", 2], ["FB-STD-01", 1]]]
];

(async () => {
    console.log(`Connecting to ${server} (a sleeping free server can take a minute to wake)…`);
    const login = await api("/users/login", { method: "POST", body: JSON.stringify({ username: ownerUser, password: ownerPass }) });
    token = login.token;
    if (login.user.role !== "admin") throw new Error("Sign in with an owner (admin) account");
    if (login.user.must_change_password) throw new Error("Sign in to the app once and change the starter password first");

    // Parts
    let parts = await api("/parts");
    let added = 0;
    for (const [name, sku, qty, min, price, cost] of PARTS) {
        if (parts.some(p => p.sku.toLowerCase() === sku.toLowerCase())) continue;
        await api("/parts", { method: "POST", body: JSON.stringify({ name, sku, qty, min, price, cost }) });
        added++;
    }
    parts = await api("/parts");
    console.log(`Parts: ${added} added (${parts.length} in stock list)`);

    // Customers
    let customers = await api("/customers");
    added = 0;
    for (const [name, phone, email, note] of CUSTOMERS) {
        const norm = "+234" + phone.slice(1);
        if (customers.some(c => c.phone === norm)) continue;
        await api("/customers", { method: "POST", body: JSON.stringify({ name, phone, email, note, consent: true }) });
        added++;
    }
    customers = await api("/customers");
    console.log(`Customers: ${added} added`);

    // A week of sales. Each has a fixed reference, so running the script again never repeats them.
    added = 0;
    const saleIds = [];
    for (let i = 0; i < SALES.length; i++) {
        const [day, hour, minute, payment_method, ci, lines] = SALES[i];
        const items = lines.map(([sku, qty]) => ({ part_id: parts.find(p => p.sku === sku).id, qty }));
        const cust = ci === null ? null : customers.find(c => c.phone === "+234" + CUSTOMERS[ci][1].slice(1));
        const sale = await api("/sales", { method: "POST", body: JSON.stringify({
            items, payment_method,
            client_ref: `demo-sale-${String(i + 1).padStart(3, "0")}-v1`,
            recorded_at: stamp(day, hour, minute),
            ...(cust ? { customer_id: cust.id, customer: cust.name } : {})
        }) });
        if (!sale.duplicate) added++;
        saleIds.push(sale.id);
    }
    console.log(`Sales: ${added} added over the last 7 days`);

    // One cancelled sale, to show how cancellations are kept on record
    try {
        await api(`/sales/${saleIds[12]}/void`, { method: "POST",
            body: JSON.stringify({ type: "cancel", reason: "Entered twice by mistake (demo)" }) });
        console.log("Cancelled 1 sale (shows the cancel / return feature)");
    } catch (e) { /* already cancelled on an earlier run */ }

    // Reviewer account (owner role, so every screen can be seen). They choose their own password at first sign-in.
    if (reviewerUser && reviewerPass) {
        const users = await api("/users");
        if (users.some(u => u.username.toLowerCase() === reviewerUser.toLowerCase()))
            console.log(`Account "${reviewerUser}" already exists — not changed`);
        else {
            await api("/users", { method: "POST", body: JSON.stringify({ username: reviewerUser, password: reviewerPass, role: "admin" }) });
            console.log(`Account "${reviewerUser}" created (owner). They'll be asked to choose their own password at first sign-in.`);
        }
    }
    console.log("Done. Open the app and look at Dashboard, Reports → Week, and Customers.");
})().catch(e => { console.error("Stopped: " + e.message); process.exit(1); });
