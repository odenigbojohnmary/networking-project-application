/**
 * routes/maintenance.js
 * ----------------------
 * Full CRUD for scheduled maintenance windows, with affected-component
 * linking and subscriber notification on creation.
 */

const express = require("express");
const router = express.Router();
const { notifySubscribers } = require("../notify");
const { authRequired, requireRole } = require("../auth");

router.use(authRequired);

async function affectedComponents(db, maintenanceId) {
  const [rows] = await db.query(
    `SELECT c.id, c.name
     FROM components c
     JOIN maintenance_components mc ON mc.component_id = c.id
     WHERE mc.maintenance_id = ?`,
    [maintenanceId]
  );
  return rows;
}

router.get("/", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM maintenance ORDER BY scheduled_start DESC");
  for (const m of rows) {
    m.components = await affectedComponents(req.db, m.id);
  }
  res.json(rows);
});

router.post("/", requireRole("editor", "super_admin"), async (req, res) => {
  const { title, description, scheduled_start, scheduled_end, component_ids = [] } = req.body;
  if (!title || !scheduled_start || !scheduled_end) {
    return res.status(400).json({ error: "title, scheduled_start and scheduled_end are required" });
  }

  const [result] = await req.db.query(
    `INSERT INTO maintenance (title, description, scheduled_start, scheduled_end, status)
     VALUES (?, ?, ?, ?, 'scheduled')`,
    [title, description || null, scheduled_start, scheduled_end]
  );
  const maintenanceId = result.insertId;

  for (const cid of component_ids) {
    await req.db.query(
      "INSERT IGNORE INTO maintenance_components (maintenance_id, component_id) VALUES (?, ?)",
      [maintenanceId, cid]
    );
  }

  await notifySubscribers(
    req.db,
    `[Scheduled Maintenance] ${title}: ${scheduled_start} to ${scheduled_end}`,
    { maintenanceId }
  );

  res.status(201).json({ id: maintenanceId, message: "Maintenance scheduled" });
});

router.get("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM maintenance WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Maintenance not found" });
  const row = rows[0];
  row.components = await affectedComponents(req.db, req.params.id);
  res.json(row);
});

router.put("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM maintenance WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Maintenance not found" });
  const existing = rows[0];

  await req.db.query(
    `UPDATE maintenance
     SET title = ?, description = ?, scheduled_start = ?, scheduled_end = ?, status = ?
     WHERE id = ?`,
    [
      req.body.title ?? existing.title,
      req.body.description ?? existing.description,
      req.body.scheduled_start ?? existing.scheduled_start,
      req.body.scheduled_end ?? existing.scheduled_end,
      req.body.status ?? existing.status,
      req.params.id,
    ]
  );
  res.json({ message: "Maintenance updated" });
});

router.delete("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [result] = await req.db.query("DELETE FROM maintenance WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Maintenance not found" });
  res.json({ message: "Maintenance deleted" });
});

module.exports = router;
