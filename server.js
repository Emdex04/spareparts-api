const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

/* =========================
   TEMP DATABASE (IN MEMORY)
========================= */

let parts = [
    { id: 1, name: "Brake Pad", sku: "BP-001", qty: 10, min: 3, price: 5000 },
    { id: 2, name: "Oil Filter", sku: "OF-002", qty: 2, min: 5, price: 3000 }
];

let sales = [];

/* =========================
   ROUTES
========================= */

// GET parts
app.get("/api/parts", (req, res) => {
    res.json(parts);
});

// UPDATE part
app.put("/api/parts/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const part = parts.find(p => p.id === id);

    if (!part) return res.status(404).json({ error: "Not found" });

    Object.assign(part, req.body);

    res.json(part);
});

// SALES
app.post("/api/sales", (req, res) => {
    const sale = {
        id: sales.length + 1,
        ...req.body,
        date: new Date().toISOString()
    };

    sales.push(sale);

    res.json(sale);
});

// LOGIN (TEMP MOCK)
app.post("/api/users/login", (req, res) => {
    const { username } = req.body;

    res.json({
        id: 1,
        username,
        role: "admin"
    });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});