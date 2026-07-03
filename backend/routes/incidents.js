/**
 * routes/incidents.js
 * --------------------
 * Full CRUD for incidents, plus the nested incident-updates timeline.
 * Creating an incident or posting a new update triggers a simulated
 * subscriber notification (see notify.js).
 */

const express = require("express");
const router = express.Router();
const { notifySubscribers } = require("../notify");
const { authRequired, requireRole } = require("../auth");

router.use(authRequired);

async function affectedComponents(db, incidentId) {
  const [rows] = await db.query(
    `SELECT c.id, c.name, c.status
     FROM components c
     JOIN incident_components ic ON ic.component_id = c.id
     WHERE ic.incident_id = ?`,
    [incidentId]
  );
  return rows;
}

router.get("/", async (req, res) => {
  const { status } = req.query;
  const [incidents] = status
    ? await req.db.query("SELECT * FROM incidents WHERE status = ? ORDER BY created_at DESC", [status])
    : await req.db.query("SELECT * FROM incidents ORDER BY created_at DESC");

  for (const inc of incidents) {
    inc.components = await affectedComponents(req.db, inc.id);
  }
  res.json(incidents);
});

router.post("/", requireRole("editor", "super_admin"), async (req, res) => {
  const {
    title,
    impact = "minor",
    message = "We are investigating this issue.",
    component_ids = [],
    component_status = "degraded",
  } = req.body;

  if (!title) return res.status(400).json({ error: "title is required" });

  const [result] = await req.db.query(
    "INSERT INTO incidents (title, impact, status) VALUES (?, ?, 'investigating')",
    [title, impact]
  );
  const incidentId = result.insertId;

  await req.db.query(
    "INSERT INTO incident_updates (incident_id, status, message) VALUES (?, 'investigating', ?)",
    [incidentId, message]
  );

  for (const cid of component_ids) {
    await req.db.query(
      "INSERT IGNORE INTO incident_components (incident_id, component_id) VALUES (?, ?)",
      [incidentId, cid]
    );
    await req.db.query("UPDATE components SET status = ? WHERE id = ?", [component_status, cid]);
  }

  await notifySubscribers(req.db, `[New Incident] ${title} (${impact}): ${message}`, {
    incidentId,
  });

  res.status(201).json({ id: incidentId, message: "Incident created" });
});

router.get("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM incidents WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Incident not found" });
  const incident = rows[0];

  const [updates] = await req.db.query(
    "SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC",
    [req.params.id]
  );

  incident.components = await affectedComponents(req.db, req.params.id);
  incident.updates = updates;
  res.json(incident);
});

router.put("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM incidents WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Incident not found" });
  const existing = rows[0];

  const newStatus = req.body.status ?? existing.status;
  let resolvedAt = existing.resolved_at;
  if (newStatus === "resolved" && existing.status !== "resolved") {
    resolvedAt = new Date();
  }

  await req.db.query(
    `UPDATE incidents SET title = ?, impact = ?, status = ?, resolved_at = ? WHERE id = ?`,
    [
      req.body.title ?? existing.title,
      req.body.impact ?? existing.impact,
      newStatus,
      resolvedAt,
      req.params.id,
    ]
  );
  res.json({ message: "Incident updated" });
});

router.delete("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [result] = await req.db.query("DELETE FROM incidents WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Incident not found" });
  res.json({ message: "Incident deleted" });
});

router.post("/:id/updates", requireRole("editor", "super_admin"), async (req, res) => {
  const { status, message } = req.body;
  if (!status || !message) {
    return res.status(400).json({ error: "status and message are required" });
  }

  const [rows] = await req.db.query("SELECT * FROM incidents WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Incident not found" });
  const incident = rows[0];

  await req.db.query(
    "INSERT INTO incident_updates (incident_id, status, message) VALUES (?, ?, ?)",
    [req.params.id, status, message]
  );

  let resolvedAt = incident.resolved_at;
  if (status === "resolved" && incident.status !== "resolved") {
    resolvedAt = new Date();
    await req.db.query(
      `UPDATE components c
       JOIN incident_components ic ON ic.component_id = c.id
       SET c.status = 'operational'
       WHERE ic.incident_id = ?`,
      [req.params.id]
    );
  }

  await req.db.query("UPDATE incidents SET status = ?, resolved_at = ? WHERE id = ?", [
    status,
    resolvedAt,
    req.params.id,
  ]);

  await notifySubscribers(
    req.db,
    `[Incident Update] ${incident.title} is now ${status}: ${message}`,
    { incidentId: req.params.id }
  );

  res.status(201).json({ message: "Update added" });
});

module.exports = router;
