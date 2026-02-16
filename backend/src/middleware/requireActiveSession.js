const jwt = require("jsonwebtoken");
const pool = require("../db");

/**
 * Checks:
 * 1) JWT is valid
 * 2) The JWT's jti exists in sessions and is not revoked
 *
 * Adds req.user = { id, role, sponsor_id, jti }
 */
module.exports = async function requireActiveSession(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "missing token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { id, role, sponsor_id, jti } = payload;

    if (!jti) return res.status(401).json({ ok: false, error: "missing session id" });

    const [rows] = await pool.query(
      "SELECT id FROM sessions WHERE user_id = ? AND jti = ? AND revoked_at IS NULL LIMIT 1",
      [id, jti]
    );

    if (!rows[0]) return res.status(401).json({ ok: false, error: "session revoked" });

    req.user = { id, role, sponsor_id, jti };
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "invalid token" });
  }
};
