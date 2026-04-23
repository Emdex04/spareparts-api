const express = require("express");
const router = express.Router();

const users = [
    { id: 1, username: "admin", password: "admin123", role: "admin" },
    { id: 2, username: "staff", password: "staff123", role: "staff" }
];

router.post("/login", (req, res) => {
    const { username, password } = req.body;

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if (!user) return res.status(401).json({ error: "Invalid login" });

    res.json(user);
});

module.exports = router;