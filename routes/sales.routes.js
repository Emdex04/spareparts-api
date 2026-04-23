const express = require("express");
const router = express.Router();

let sales = [];

router.get("/", (req, res) => {
    res.json(sales);
});

router.post("/", (req, res) => {
    const sale = { id: Date.now(), timestamp: new Date(), ...req.body };
    sales.push(sale);
    res.json(sale);
});

module.exports = router;