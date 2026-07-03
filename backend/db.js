/**
 * db.js
 * -----
 * MySQL connection pool (keyed by database name, so the real DB pool and
 * the test DB pool used by Jest never collide) plus schema initialisation.
 */

const mysql = require("mysql2/promise");
const { hashPassword } = require("./auth");
const { DEFAULT_ADMIN } = require("./config");

const dbpools = {};

function dbconnPool(config) {
  const key = config.database;
  if (!dbpools[key]) {
    dbpools[key] = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return dbpools[key];
}

async function initDB(config) {
  const dbconn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  await dbconn.query(`CREATE DATABASE IF NOT EXISTS ${config.database}`);
  await dbconn.query(`USE ${config.database}`);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS components (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255),
      group_name VARCHAR(120) DEFAULT 'General',
      status ENUM('operational','degraded','partial_outage','major_outage','maintenance')
             NOT NULL DEFAULT 'operational',
      display_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      impact ENUM('minor','major','critical') NOT NULL DEFAULT 'minor',
      status ENUM('investigating','identified','monitoring','resolved')
             NOT NULL DEFAULT 'investigating',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS incident_updates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      status ENUM('investigating','identified','monitoring','resolved') NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS incident_components (
      incident_id INT NOT NULL,
      component_id INT NOT NULL,
      PRIMARY KEY (incident_id, component_id),
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS maintenance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      scheduled_start DATETIME NOT NULL,
      scheduled_end DATETIME NOT NULL,
      status ENUM('scheduled','in_progress','completed','cancelled')
             NOT NULL DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS maintenance_components (
      maintenance_id INT NOT NULL,
      component_id INT NOT NULL,
      PRIMARY KEY (maintenance_id, component_id),
      FOREIGN KEY (maintenance_id) REFERENCES maintenance(id) ON DELETE CASCADE,
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(180) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscriber_id INT NOT NULL,
      incident_id INT NULL,
      maintenance_id INT NULL,
      message TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (maintenance_id) REFERENCES maintenance(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('super_admin','editor','viewer') NOT NULL DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      description VARCHAR(255),
      type ENUM('server','web_app','database','domain','other') NOT NULL DEFAULT 'other',
      ping_url VARCHAR(500) NULL,
      check_interval_seconds INT NOT NULL DEFAULT 300,
      status ENUM('up','down','unknown') NOT NULL DEFAULT 'unknown',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await dbconn.query(`
    CREATE TABLE IF NOT EXISTS uptime_checks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      status ENUM('up','down') NOT NULL,
      response_time_ms INT NULL,
      source ENUM('auto','manual') NOT NULL DEFAULT 'manual',
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await seedDefaultAdmin(dbconn);

  await dbconn.end();
}

/**
 * Ensures there is always at least one super_admin to log in with.
 * Runs every time initDB() runs but only inserts when the staff table is
 * empty, so it's safe to call on every server start.
 */
async function seedDefaultAdmin(dbconn) {
  const [rows] = await dbconn.query("SELECT COUNT(*) AS count FROM staff");
  if (rows[0].count > 0) return;

  const password_hash = await hashPassword(DEFAULT_ADMIN.password);
  await dbconn.query(
    "INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, 'super_admin')",
    [DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, password_hash]
  );
  console.log(`[seed] Created default super admin: ${DEFAULT_ADMIN.email}`);
}

module.exports = { dbconnPool, initDB, seedDefaultAdmin };
