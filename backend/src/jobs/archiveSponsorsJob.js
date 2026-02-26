const pool = require("../db");

async function writeAudit(details, success = 1) {
  await pool.query(
    "INSERT INTO audit_logs (category, success, details) VALUES (?, ?, ?)",
    ["SPONSOR_ARCHIVE_JOB", success ? 1 : 0, details]
  );
}

/**
 * Archives sponsors that are INACTIVE older than N days.
 * status: INACTIVE -> ARCHIVED
 */
async function runArchiveSponsorsJob() {
  const days = Number(process.env.SPONSOR_ARCHIVE_AFTER_DAYS || 30);

  try {
    const [res] = await pool.query(
      `UPDATE sponsors
       SET status = 'ARCHIVED'
       WHERE status = 'DEACTIVATED'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    await writeAudit(`archived sponsors: affectedRows=${res.affectedRows}`, 1);
 } catch (err) {
  console.error("archiveSponsorsJob failed:", err);
  try {
    await writeAudit(`failed: ${err.message}`, 0);
  } catch (auditErr) {
    console.error("writeAudit also failed:", auditErr.message);
  }
}
}

module.exports = { runArchiveSponsorsJob };
