const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

/**
 * ============================================================================
 *  TESTIMONI PELANGGAN
 * ============================================================================
 *  Popup di dalam aplikasi (lihat authController.login/googleLogin yang
 *  menaikkan users.login_count, dan frontend TestimonialPrompt.jsx yang
 *  menawarkannya tiap kelipatan 3 login) mengumpulkan testimoni lewat
 *  submitTestimonial di sini. Isian TIDAK PERNAH langsung tampil publik --
 *  status defaultnya 'pending', ditinjau admin platform (approve/reject di
 *  platformController) sebelum listPublicTestimonials mengembalikannya ke
 *  landing page.
 * ============================================================================
 */

const MESSAGE_MAX_LENGTH = 1000;
const ROLE_MAX_LENGTH = 150;

// POST /api/testimonials — { rating, message, authorRole? }
const submitTestimonial = asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating);
  const message = String(req.body.message || '').trim();
  const authorRole = req.body.authorRole ? String(req.body.authorRole).trim().slice(0, ROLE_MAX_LENGTH) : null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Beri rating 1-5 bintang.' });
  }
  if (!message) {
    return res.status(400).json({ message: 'Testimoni tidak boleh kosong.' });
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({ message: `Testimoni maksimal ${MESSAGE_MAX_LENGTH} karakter.` });
  }

  const [[tenantRow]] = await pool.query(`SELECT company_name AS "companyName" FROM tenants WHERE id = :tenantId`, { tenantId: req.user.tenant_id });

  const [result] = await pool.query(
    `INSERT INTO testimonials (tenant_id, user_id, author_name, author_role, company_name, rating, message)
     VALUES (:tenantId, :userId, :authorName, :authorRole, :companyName, :rating, :message)
     RETURNING id`,
    {
      tenantId: req.user.tenant_id, userId: req.user.id, authorName: req.user.name,
      authorRole, companyName: tenantRow?.companyName || '', rating, message,
    }
  );

  await pool.query(`UPDATE users SET testimonial_status = 'submitted' WHERE id = :id`, { id: req.user.id });
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'create', entityType: 'testimonial', entityId: result.insertId, newValues: { rating } });

  res.status(201).json({ id: result.insertId, message: 'Terima kasih atas testimoninya!' });
});

// POST /api/testimonials/skip — tenant memilih "Lewati", tidak ditawarkan lagi selamanya.
const skipTestimonial = asyncHandler(async (req, res) => {
  await pool.query(`UPDATE users SET testimonial_status = 'skipped' WHERE id = :id`, { id: req.user.id });
  res.json({ testimonialStatus: 'skipped' });
});

// GET /api/public/testimonials — publik, TANPA AUTH. Hanya yang 'approved',
// tanpa data tenant yang bisa dipakai mengorek identitas akun (tidak ada
// email/username, cuma nama & jabatan yang MEMANG dimaksudkan tenant untuk
// tampil publik saat mengisi).
const listPublicTestimonials = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, author_name AS "authorName", author_role AS "authorRole", company_name AS "companyName",
            rating, message
     FROM testimonials WHERE status = 'approved'
     ORDER BY reviewed_at DESC
     LIMIT 12`
  );
  res.json(rows);
});

module.exports = { submitTestimonial, skipTestimonial, listPublicTestimonials };
