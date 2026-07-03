/**
 * config.js
 * ---------
 * Database configuration loaded from environment variables.
 */

require("dotenv").config();

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "statuswatch_db",
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-production";

const DEFAULT_ADMIN = {
  name: process.env.ADMIN_NAME || "Default Admin",
  email: process.env.ADMIN_EMAIL || "admin@statuswatch.local",
  password: process.env.ADMIN_PASSWORD || "ChangeMe123!",
};

module.exports = { DB_CONFIG, JWT_SECRET, DEFAULT_ADMIN };
