/**
 * routes/assets.js
 * -----------------
 * CRUD for company assets (servers, web apps, databases, domains, etc.)
 * tracked for uptime. Viewing requires any logged-in staff member;
 * creating/editing/deleting requires editor or super_admin.
 *
 * Uptime itself comes from two sources, per asset:
 *   - Automatic: if the asset has a ping_url, backend/monitor.js pings it
 *     on an interval and logs the result.
 *   - Manual: staff can log a check by hand via POST /:id/checks (useful
 *     for assets with no HTTP endpoint to ping, e.g. a database server).
 */

const express = require("express");
const router = express.Router();
const { authRequired, requireRole } = require("../auth");
const { withUptimeWindows } = require("../uptime");

const TYPES = ["server", "web_app", "database", "domain", "other"];

router.use(authRequired);

router.get("/", async (req, res) => {
  const [assets] = await req.db.query("SELECT * FROM assets ORDER BY name");
  const withUptime = await Promise.all(assets.map((a) => withUptimeWindows(req.db, a)));
  res.json(withUptime);
});

router.post("/", requireRole("editor", "super_admin"), async (req, res) => {
  const { name, description, type = "other", ping_url = null, check_interval_seconds = 300 } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!TYPES.includes(type)) return res.status(400).json({ error: "invalid type" });

  const [result] = await req.db.query(
    `INSERT INTO assets (name, description, type, ping_url, check_interval_seconds)
     VALUES (?, ?, ?, ?, ?)`,
    [name, description || null, type, ping_url, check_interval_seconds]
  );
  res.status(201).json({ id: result.insertId, message: "Asset created" });
});

router.get("/:id", async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM assets WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Asset not found" });
  res.json(await withUptimeWindows(req.db, rows[0]));
});

router.put("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [rows] = await req.db.query("SELECT * FROM assets WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Asset not found" });
  const existing = rows[0];
  const { name, description, type, ping_url, check_interval_seconds } = req.body;

  if (type && !TYPES.includes(type)) return res.status(400).json({ error: "invalid type" });

  await req.db.query(
    `UPDATE assets SET name = ?, description = ?, type = ?, ping_url = ?, check_interval_seconds = ?
     WHERE id = ?`,
    [
      name ?? existing.name,
      description ?? existing.description,
      type ?? existing.type,
      ping_url ?? existing.ping_url,
      check_interval_seconds ?? existing.check_interval_seconds,
      req.params.id,
    ]
  );
  res.json({ message: "Asset updated" });
});

router.delete("/:id", requireRole("editor", "super_admin"), async (req, res) => {
  const [result] = await req.db.query("DELETE FROM assets WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: "Asset not found" });
  res.json({ message: "Asset deleted" });
});

// Manual heartbeat log — for assets without a ping_url, or to record an
// out-of-band observation (e.g. "I just checked, the DB is down").
router.post("/:id/checks", requireRole("editor", "super_admin"), async (req, res) => {
  const { status, response_time_ms = null } = req.body;
  if (!["up", "down"].includes(status)) {
    return res.status(400).json({ error: "status must be 'up' or 'down'" });
  }

  const [rows] = await req.db.query("SELECT id FROM assets WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Asset not found" });

  await req.db.query(
    "INSERT INTO uptime_checks (asset_id, status, response_time_ms, source) VALUES (?, ?, ?, 'manual')",
    [req.params.id, status, response_time_ms]
  );
  await req.db.query("UPDATE assets SET status = ? WHERE id = ?", [status, req.params.id]);
  res.status(201).json({ message: "Check logged" });
});

router.get("/:id/checks", async (req, res) => {
  const [rows] = await req.db.query("SELECT id FROM assets WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Asset not found" });

  const [checks] = await req.db.query(
    "SELECT * FROM uptime_checks WHERE asset_id = ? ORDER BY checked_at DESC LIMIT 100",
    [req.params.id]
  );
  res.json(checks);
});

module.exports = router;
