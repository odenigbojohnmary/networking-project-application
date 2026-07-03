/**
 * routes/notifications.js
 * ------------------------
 * Read-only view of the notification log — admin only.
 */

const express = require("express");
const router = express.Router();
const { authRequired } = require("../auth");

router.get("/", authRequired, async (req, res) => {
  const [rows] = await req.db.query(`
    SELECT n.id, s.email, n.message, n.sent_at, n.incident_id, n.maintenance_id
    FROM notifications n
    JOIN subscribers s ON s.id = n.subscriber_id
    ORDER BY n.sent_at DESC
    LIMIT 200
  `);
  res.json(rows);
});

module.exports = router;
