const pool = require('../config/db');

/**
 * Mencatat aktivitas ke tabel audit_logs.
 *
 * `tenantId` opsional — kalau tidak dioper eksplisit, diturunkan dari
 * `userId` (lewat lookup ke tabel users). Ini sengaja dibuat begitu supaya
 * SELURUH pemanggil logAudit() yang sudah ada (memberi userId, hampir semua
 * kasus) TIDAK PERLU diubah satu per satu saat tenant_id ditambahkan —
 * hanya pemanggil untuk aksi ANONIM (userId null, mis. pemindaian QR publik)
 * yang wajib mengoper `tenantId` sendiri, karena tidak ada user untuk
 * diturunkan tenant-nya.
 */
async function logAudit({ userId = null, tenantId = null, action, entityType, entityId = null, oldValues = null, newValues = null, ipAddress = null }) {
  try {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && userId) {
      const [rows] = await pool.query(`SELECT tenant_id FROM users WHERE id = :userId`, { userId });
      resolvedTenantId = rows[0]?.tenant_id ?? null;
    }
    if (!resolvedTenantId) {
      console.error(
        `Gagal menulis audit log (${entityType}/${action}): tenant_id tidak diketahui — ` +
        `pemanggil dengan userId null wajib mengoper tenantId eksplisit.`
      );
      return;
    }

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (:tenantId, :userId, :action, :entityType, :entityId, :oldValues, :newValues, :ipAddress)`,
      {
        tenantId: resolvedTenantId,
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
