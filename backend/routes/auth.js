/**
 * routes/auth.js
 * ---------------
 * Staff login. No registration endpoint on purpose — staff accounts are
 * created by a super_admin via routes/staff.js, not self-service.
 */

const express = require("express");
const router = express.Router();
const { comparePassword, signToken, authRequired } = require("../auth");

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const [rows] = await req.db.query("SELECT * FROM staff WHERE email = ?", [email]);
  if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

  const staff = rows[0];
  const ok = await comparePassword(password, staff.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(staff);
  res.json({
    token,
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
  });
});

// Lets the frontend re-validate a stored token on page load.
router.get("/me", authRequired, (req, res) => {
  res.json({ staff: req.staff });
});

module.exports = router;
