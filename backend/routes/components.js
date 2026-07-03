/**
 * routes/components.js
 * ---------------------
 * Full CRUD for status page components.
 */

const express = require("express");
const router = express.Router();
const { authRequired, requireRole } = require("../auth");

router.use(authRequired);

router.get("/", async (req, res) => {
  const [rows] = await req.db.query(
    "SELECT * FROM components ORDER BY group_name, display_order, id"
  );
  res.json(rows);
});

router.post("/", requireRole("editor", "super_admin"), async (req, res) => {
  const { name, description, group_name = "General", status = "operational", display_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const [result] = await req.db.query(
    `INSERT INTO components (name, description, group_name, status, display_order)
     VALUES (?, ?, ?, ?, ?)`,
    [name, description || null, group_name, status, display_order]
  );
  res.status(201).json({ id: result.insertId, message: "Component created" });
});

router.get("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM components WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Component not found" });
  res.json(rows[0]);
});

router.put("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM components WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Component not found" });
  const existing = rows[0];
  const { name, description, group_name, status, display_order } = req.body;

  await req.db.query(
    `UPDATE components SET name = ?, description = ?, group_name = ?, status = ?, display_order = ?
     WHERE id = ?`,
    [
      name ?? existing.name,
      description ?? existing.description,
      group_name ?? existing.group_name,
      status ?? existing.status,
      display_order ?? existing.display_order,
      req.params.id,
    ]
  );
  res.json({ message: "Component updated" });
});

router.delete("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [result] = await req.db.query("DELETE FROM components WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Component not found" });
  res.json({ message: "Component deleted" });
});

module.exports = router;
