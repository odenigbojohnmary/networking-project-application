/**
 * server.js
 * ---------
 * Express application entry point for StatusWatch (JS version).
 *
 * Exposes a createApp(config) factory — mirroring the Python version's
 * create_app() — so tests can build an app against a separate test
 * database instead of the real one.
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const { dbconnPool, initDB } = require("./db");
const { DB_CONFIG } = require("./config");
const { startMonitor } = require("./monitor");

const FRONTEND = path.join(__dirname, "..", "frontend");

async function createApp(config = DB_CONFIG) {
  await initDB(config);
  const pool = dbconnPool(config);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use((req, _res, next) => {
    req.db = pool;
    next();
  });

  app.use("/api/public", require("./routes/public"));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/staff", require("./routes/staff"));
  app.use("/api/assets", require("./routes/assets"));
  app.use("/api/components", require("./routes/components"));
  app.use("/api/incidents", require("./routes/incidents"));
  app.use("/api/maintenance", require("./routes/maintenance"));
  app.use("/api/subscribers", require("./routes/subscribers"));
  app.use("/api/notifications", require("./routes/notifications"));
  app.use("/api/dashboard", require("./routes/dashboard"));

  app.use(express.static(FRONTEND));
  app.get("*", (_req, res) => res.sendFile(path.join(FRONTEND, "index.html")));

  app.locals.pool = pool;
  return app;
}

async function start() {
  const app = await createApp(DB_CONFIG);
  const PORT = process.env.PORT || 5050;
  startMonitor(app.locals.pool); // Start the monitoring process
  app.listen(PORT, () => {
    console.log(`[Server] JmZOps running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch(console.error);
}

module.exports = { createApp };
