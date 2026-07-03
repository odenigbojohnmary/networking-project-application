/**
 * routes/staff.js
 * ----------------
 * Staff account management. super_admin only — editors and viewers can't
 * see or touch this, even though they can log in themselves.
 */

const express = require("express");
const router = express.Router();
const { authRequired, requireRole, hashPassword, ROLES } = require("../auth");

router.use(authRequired);
router.use(requireRole("super_admin"));

async function superAdminCount(db) {
  const [rows] = await db.query("SELECT COUNT(*) AS count FROM staff WHERE role = 'super_admin'");
  return rows[0].count;
}

router.get("/", async (req, res) => {
  const [rows] = await req.db.query(
    "SELECT id, name, email, role, created_at FROM staff ORDER BY id"
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name, email, password, role = "viewer" } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: "invalid role" });

  const [existing] = await req.db.query("SELECT id FROM staff WHERE email = ?", [email]);
  if (existing.length) return res.status(409).json({ error: "Email already in use" });

  const password_hash = await hashPassword(password);
  const [result] = await req.db.query(
    "INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [name, email, password_hash, role]
  );
  res.status(201).json({ id: result.insertId, message: "Staff member created" });
});

router.put("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM staff WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Staff member not found" });
  const existing = rows[0];
  const { name, email, password, role } = req.body;

  if (role && !ROLES.includes(role)) return res.status(400).json({ error: "invalid role" });

  if (existing.role === "super_admin" && role && role !== "super_admin") {
    if ((await superAdminCount(req.db)) <= 1) {
      return res.status(409).json({ error: "Cannot demote the last super admin" });
    }
  }

  const password_hash = password ? await hashPassword(password) : existing.password_hash;
  await req.db.query(
    "UPDATE staff SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?",
    [name ?? existing.name, email ?? existing.email, password_hash, role ?? existing.role, req.params.id]
  );
  res.json({ message: "Staff member updated" });
});

router.delete("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM staff WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Staff member not found" });

  if (rows[0].role === "super_admin" && (await superAdminCount(req.db)) <= 1) {
    return res.status(409).json({ error: "Cannot delete the last super admin" });
  }

  await req.db.query("DELETE FROM staff WHERE id = ?", [req.params.id]);
  res.json({ message: "Staff member deleted" });
});

module.exports = router;
