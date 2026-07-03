/**
 * uptime.js
 * ---------
 * Shared helper for computing rolling uptime percentages from the
 * uptime_checks log. Used by both the admin assets route and the public
 * uptime feed (routes/public.js).
 */

async function computeUptimePercent(db, assetId, days) {
  const [rows] = await db.query(
    "SELECT status FROM uptime_checks WHERE asset_id = ? AND checked_at >= (NOW() - INTERVAL ? DAY)",
    [assetId, days]
  );
  if (!rows.length) return null;
  const up = rows.filter((r) => r.status === "up").length;
  return Math.round((up / rows.length) * 10000) / 100; // percentage, 2 decimal places
}

async function withUptimeWindows(db, asset) {
  const [uptime_24h, uptime_7d, uptime_30d, uptime_90d] = await Promise.all([
    computeUptimePercent(db, asset.id, 1),
    computeUptimePercent(db, asset.id, 7),
    computeUptimePercent(db, asset.id, 30),
    computeUptimePercent(db, asset.id, 90),
  ]);
  return { ...asset, uptime_24h, uptime_7d, uptime_30d, uptime_90d };
}

module.exports = { computeUptimePercent, withUptimeWindows };
