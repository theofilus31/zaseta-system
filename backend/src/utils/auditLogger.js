const pool = require('../config/db');

/**
 * Mencatat aktivitas ke tabel audit_logs.
 */
async function logAudit({ userId = null, action, entityType, entityId = null, oldValues = null, newValues = null, ipAddress = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (:userId, :action, :entityType, :entityId, :oldValues, :newValues, :ipAddress)`,
      {
        userId,
        action,
        entityType,
        entityId,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        ipAddress,
      }
    );
  } catch (err) {
    console.error('Gagal menulis audit log:', err.message);
  }
}

module.exports = logAudit;
