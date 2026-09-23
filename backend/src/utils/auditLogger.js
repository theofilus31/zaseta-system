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
 *
 * `platformAdminId` — actor untuk aksi admin platform (kelola tenant, katalog
 * paket, dst., lihat controllers/platformController.js). SENGAJA kolom
 * terpisah dari `userId`, BUKAN dituliskan ke kolom itu: audit_logs.user_id
 * di-FK ke tabel `users`, sedangkan admin platform hidup di tabel
 * `platform_admins` yang independen (id-nya urutan sendiri) sejak
 * migration_separate_platform_admins.sql. Menaruh id admin platform di
 * user_id akan gagal FK-nya (log hilang total) atau, lebih buruk, kebetulan
 * cocok dengan id pengguna tenant yang tidak terkait dan salah atribusi.
 * Kalau `platformAdminId` diisi, `tenantId` boleh tetap null (aksi lintas
 * tenant murni) ATAU diisi tenant yang datanya terdampak (mis. approve
 * testimoni tenant tertentu) — keduanya sah, tidak saling meniadakan.
 */
async function logAudit({ userId = null, tenantId = null, platformAdminId = null, action, entityType, entityId = null, oldValues = null, newValues = null, ipAddress = null }) {
  try {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && userId) {
      const [rows] = await pool.query(`SELECT tenant_id FROM users WHERE id = :userId`, { userId });
      resolvedTenantId = rows[0]?.tenant_id ?? null;
    }
    // Aksi tenant biasa (userId ada, bukan admin platform) TETAP wajib
    // punya tenant_id yang bisa diturunkan -- baris tanpa tenant sungguhan
    // di sini kemungkinan besar bug pemanggil, bukan kasus sah seperti aksi
    // admin platform di bawah.
    if (!resolvedTenantId && userId && !platformAdminId) {
      console.error(
        `Gagal menulis audit log (${entityType}/${action}): tenant_id tidak diketahui — ` +
        `pemanggil dengan userId null wajib mengoper tenantId eksplisit.`
      );
      return;
    }

    await pool.query(
      `INSERT INTO audit_logs (tenant_id, user_id, platform_admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (:tenantId, :userId, :platformAdminId, :action, :entityType, :entityId, :oldValues, :newValues, :ipAddress)`,
      {
        tenantId: resolvedTenantId,
        userId,
        platformAdminId,
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
