/**
 * auth.js
 * -------
 * Password hashing, JWT issuing/verification, and Express middleware for
 * the staff/admin side of the app. Three roles:
 *   - super_admin : everything, including managing staff accounts
 *   - editor      : components, incidents, maintenance, assets, subscribers
 *   - viewer      : read-only access to the admin panel
 *
 * The public status page and uptime feed (routes/public.js) never go
 * through this — they're intentionally open to everyone.
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { JWT_SECRET } = require("./config");

const ROLES = ["super_admin", "editor", "viewer"];

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(staff) {
  return jwt.sign(
    { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

/** Requires a valid Bearer token. Populates req.staff with the decoded payload. */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    req.staff = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Use after authRequired. Restricts the route to one or more roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.staff.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}

module.exports = { ROLES, hashPassword, comparePassword, signToken, authRequired, requireRole };
