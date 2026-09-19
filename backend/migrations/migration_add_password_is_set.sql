-- Akun yang DIDAFTARKAN lewat Google (authController.googleSignup) tidak pernah
-- memilih kata sandi -- password_hash-nya hash acak yang tidak diketahui siapa
-- pun. Halaman Profil dulu tetap mewajibkan "kata sandi saat ini", jadi
-- pengguna Google tidak bisa membuat kata sandi sama sekali.
--
-- password_is_set = FALSE berarti "belum punya kata sandi buatan sendiri":
-- Profil boleh membuatnya tanpa kata sandi lama. Menjadi TRUE lagi begitu
-- kata sandi dibuat (Profil) atau direset (Lupa Kata Sandi).
ALTER TABLE users ADD COLUMN password_is_set BOOLEAN NOT NULL DEFAULT TRUE;

-- Akun lama yang lahir dari pendaftaran Google dikenali dari audit log
-- pembuatan tenant (via = 'google', user_id = admin pertamanya). Akun lama yang
-- hanya DITAUTKAN ke Google (sudah punya kata sandi asli) dibiarkan TRUE.
UPDATE users SET password_is_set = FALSE
WHERE id IN (
    SELECT user_id FROM audit_logs
    WHERE entity_type = 'tenant' AND action = 'create'
      AND new_values ->> 'via' = 'google' AND user_id IS NOT NULL
);
