-- Testimoni pelanggan -- popup diminta muncul di dalam aplikasi setiap
-- kelipatan 3 kali login (lihat authController.login/googleLogin,
-- frontend/src/components/TestimonialPrompt.jsx), dan yang disetujui admin
-- platform ditampilkan di landing page (GET /api/public/testimonials).

-- login_count: dinaikkan tiap login sukses -- popup ditawarkan saat
-- login_count % 3 = 0. testimonial_status: 'skipped' (pilih "Lewati") =
-- tidak ditawarkan lagi SELAMANYA; 'submitted' = sudah mengisi, juga tidak
-- ditawarkan lagi. "Ingatkan nanti" SENGAJA tidak mengubah status apa pun --
-- status tetap 'none', jadi popup otomatis muncul lagi begitu login_count
-- mencapai kelipatan 3 berikutnya, tanpa perlu kolom pengingat terpisah.
ALTER TABLE users ADD COLUMN login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN testimonial_status VARCHAR(20) NOT NULL DEFAULT 'none'
  CHECK (testimonial_status IN ('none', 'skipped', 'submitted'));

CREATE TABLE testimonials (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name     VARCHAR(150) NOT NULL,  -- snapshot SAAT mengisi -- tidak ikut berubah kalau nama akun diganti belakangan
    author_role     VARCHAR(150) NULL,       -- jabatan/peran, opsional
    company_name    VARCHAR(150) NOT NULL,   -- snapshot nama perusahaan
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    message         TEXT NOT NULL,
    -- Ditinjau admin platform dulu (requirePlatformAdmin) sebelum tampil di
    -- landing page publik -- konten isian pengguna TIDAK PERNAH langsung
    -- terbit tanpa tinjauan, sama seperti alasan permintaan upgrade dulu
    -- ditinjau sebelum Fase Pakasir (kini otomatis untuk pembayaran, tapi
    -- testimoni tetap perlu mata manusia karena ini teks bebas publik).
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_testimonials_status ON testimonials(status);
CREATE INDEX idx_testimonials_tenant ON testimonials(tenant_id);
