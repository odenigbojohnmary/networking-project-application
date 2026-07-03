/**
 * monitor.js
 * ----------
 * Background uptime monitor. On an interval, pings every asset that has a
 * ping_url configured (HTTP GET, 5s timeout) and logs the result as an
 * automatic uptime check. Assets with no ping_url (e.g. a bare-metal
 * server with nothing to HTTP-ping) rely entirely on the manual heartbeat
 * log instead (POST /api/assets/:id/checks).
 *
 * Only started from server.js's start() — never from createApp(), so
 * Jest tests don't spawn background timers.
 */

const DEFAULT_INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS || "60000", 10);
const PING_TIMEOUT_MS = 5000;

async function pingAsset(asset) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(asset.ping_url, { method: "GET", signal: controller.signal });
    return { status: res.ok ? "up" : "down", responseTime: Date.now() - start };
  } catch (err) {
    return { status: "down", responseTime: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

async function runMonitorCycle(pool) {
  const [assets] = await pool.query(
    "SELECT id, ping_url FROM assets WHERE ping_url IS NOT NULL AND ping_url != ''"
  );

  for (const asset of assets) {
    const { status, responseTime } = await pingAsset(asset);
    await pool.query(
      "INSERT INTO uptime_checks (asset_id, status, response_time_ms, source) VALUES (?, ?, ?, 'auto')",
      [asset.id, status, responseTime]
    );
    await pool.query("UPDATE assets SET status = ? WHERE id = ?", [status, asset.id]);
  }
}

function startMonitor(pool, intervalMs = DEFAULT_INTERVAL_MS) {
  const cycle = () => runMonitorCycle(pool).catch((err) => console.error("[monitor] cycle failed:", err.message));
  cycle();
  return setInterval(cycle, intervalMs);
}

module.exports = { startMonitor, runMonitorCycle, pingAsset };
