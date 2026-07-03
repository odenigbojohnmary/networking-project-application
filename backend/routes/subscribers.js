/**
 * routes/subscribers.js
 * ----------------------
 * Public subscribe form (POST) stays open — it's on the status page for
 * visitors. Admin listing (GET) and unsubscribe (DELETE) require login.
 */

const express = require("express");
const router = express.Router();
const { authRequired } = require("../auth");

router.get("/", authRequired, async (req, res) => {
  const [rows] = await req.db.query(
    "SELECT * FROM subscribers ORDER BY created_at DESC"
  );
  res.json(rows);
});

// Public — anyone visiting the status page can subscribe.
router.post("/", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const [result] = await req.db.query(
      "INSERT INTO subscribers (email) VALUES (?)",
      [email]
    );
    res.status(201).json({ id: result.insertId, message: "Subscribed successfully" });
  } catch (err) {
    res.status(409).json({ error: "Email already subscribed" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  const [result] = await req.db.query(
    "DELETE FROM subscribers WHERE id = ?",
    [req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: "Subscriber not found" });
  res.json({ message: "Subscriber removed" });
});

module.exports = router;
