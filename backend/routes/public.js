/**
 * routes/public.js
 * -----------------
 * The public-facing status page data feed — overall system status, every
 * component's current status, active incidents, and upcoming maintenance.
 * No authentication required.
 */

const express = require("express");
const router = express.Router();
const { withUptimeWindows } = require("../uptime");

const SEVERITY_ORDER = ["operational", "maintenance", "degraded", "partial_outage", "major_outage"];

function overallStatus(statuses) {
  if (!statuses.length) return "operational";
  return statuses.reduce((worst, s) =>
    SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(worst) ? s : worst
  );
}

router.get("/status", async (req, res) => {
  const [components] = await req.db.query(
    "SELECT * FROM components ORDER BY group_name, display_order, id"
  );

  const [activeIncidents] = await req.db.query(
    "SELECT * FROM incidents WHERE status != 'resolved' ORDER BY created_at DESC"
  );
  for (const inc of activeIncidents) {
    const [updates] = await req.db.query(
      "SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC",
      [inc.id]
    );
    inc.updates = updates;
  }

  const [maintenance] = await req.db.query(
    "SELECT * FROM maintenance WHERE status IN ('scheduled','in_progress') ORDER BY scheduled_start ASC"
  );

  res.json({
    overall_status: overallStatus(components.map((c) => c.status)),
    components,
    active_incidents: activeIncidents,
    upcoming_maintenance: maintenance,
  });
});

// Public uptime feed — no login required. Exposes name/type/status/uptime
// percentages only; ping_url and check_interval_seconds stay internal.
router.get("/uptime", async (req, res) => {
  const [assets] = await req.db.query(
    "SELECT id, name, description, type, status FROM assets ORDER BY name"
  );
  const withUptime = await Promise.all(assets.map((a) => withUptimeWindows(req.db, a)));
  res.json(withUptime);
});

module.exports = router;
