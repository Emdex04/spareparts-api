const express = require("express");
const router = express.Router();

// TEMP DATA (later replace with DB)
let parts = [];

router.get("/", (req, res) => {
    res.json(parts);
});

router.post("/", (req, res) => {
    const newPart = { id: Date.now(), ...req.body };
    parts.push(newPart);
    res.json(newPart);
});

router.put("/:id", (req, res) => {
    const id = parseInt(req.params.id);
    parts = parts.map(p => p.id === id ? { ...p, ...req.body } : p);
    res.json({ message: "Updated" });
});

module.exports = router;