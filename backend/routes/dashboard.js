/**
 * routes/dashboard.js
 * --------------------
 * Admin-only aggregate statistics shown at the top of the admin panel.
 */

const express = require("express");
const router = express.Router();
const { authRequired } = require("../auth");

router.get("/", authRequired, async (req, res) => {
  const [[{ total_incidents }]] = await req.db.query(
    "SELECT COUNT(*) AS total_incidents FROM incidents"
  );

  const [[{ open_incidents }]] = await req.db.query(
    "SELECT COUNT(*) AS open_incidents FROM incidents WHERE status != 'resolved'"
  );

  const [[{ avg_resolution_minutes }]] = await req.db.query(`
    SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)), 1) AS avg_resolution_minutes
    FROM incidents
    WHERE resolved_at IS NOT NULL
  `);

  const [[{ upcoming_maintenance }]] = await req.db.query(
    "SELECT COUNT(*) AS upcoming_maintenance FROM maintenance WHERE status IN ('scheduled', 'in_progress')"
  );

  const [[{ total_subscribers }]] = await req.db.query(
    "SELECT COUNT(*) AS total_subscribers FROM subscribers"
  );

  const [[{ total_notifications_sent }]] = await req.db.query(
    "SELECT COUNT(*) AS total_notifications_sent FROM notifications"
  );

  res.json({
    total_incidents,
    open_incidents,
    avg_resolution_minutes,
    upcoming_maintenance,
    total_subscribers,
    total_notifications_sent,
  });
});

module.exports = router;
