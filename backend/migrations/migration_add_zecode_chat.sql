-- =====================================================================
--  Zecode — Asisten AI internal
-- =====================================================================
--  Chatbot yang dijalankan LOKAL lewat Ollama (model open-source, girang
--  di komputer/server sendiri) — bukan memanggil API AI pihak luar, jadi
--  data perusahaan tidak pernah keluar dari server aplikasi ini, dan tidak
--  ada biaya per-pesan.
--
--  Dua tabel:
--
--    chat_conversations — satu sesi obrolan. Judulnya diambil otomatis dari
--                         pesan pertama, seperti riwayat obrolan pada
--                         umumnya, supaya mudah dikenali saat dibuka lagi.
--
--    chat_messages       — setiap pesan (dari pengguna maupun dari Zecode).
--                         `intent` & `action_payload` menyimpan APA yang
--                         dipahami Zecode dari pesan itu (bukan hanya
--                         teksnya) — berguna untuk audit "kenapa Zecode
--                         menjawab begini" dan untuk alur konfirmasi aksi.
--
--  Percakapan MILIK PRIBADI tiap pengguna — tidak ada yang bisa membaca
--  percakapan orang lain, termasuk administrator (kecuali langsung lewat
--  database). Ini konsisten dengan bagaimana Profil diperlakukan di
--  aplikasi ini: data yang melekat ke akun sendiri, bukan menu bersama.
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_zecode_chat.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NOT NULL,
    title        VARCHAR(150) NULL,          -- diisi otomatis dari pesan pertama
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_conv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_chat_conv_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id   BIGINT UNSIGNED NOT NULL,

    role              ENUM('user','assistant') NOT NULL,
    content           TEXT NOT NULL,

    -- Apa yang dipahami Zecode dari pesan ini — diisi hanya untuk pesan
    -- 'assistant'. NULL wajar untuk basa-basi/sapaan yang tidak menyentuh
    -- data sama sekali.
    intent            VARCHAR(50) NULL,

    -- Kalau pesan ini adalah TAWARAN AKSI (mis. "ajukan permintaan aset X"),
    -- rincian yang diusulkan Zecode disimpan di sini sebagai JSON, dan
    -- statusnya dilacak terpisah dari isi obrolan. Aksi TIDAK PERNAH
    -- dijalankan otomatis — endpoint eksekusinya baru dipanggil setelah
    -- pengguna menekan tombol konfirmasi di antarmuka.
    action_type       VARCHAR(50) NULL,
    action_payload    JSON NULL,
    action_status     ENUM('none','pending','confirmed','cancelled') NOT NULL DEFAULT 'none',

    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_msg_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,

    INDEX idx_chat_msg_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- IZIN MENU BARU
-- ---------------------------------------------------------------------
--  Zecode ikut aturan izin per menu seperti fitur lain. SEMUA pengguna
--  yang sudah aktif diberi akses awal — ini alat bantu, bukan menu
--  sensitif, jadi wajar dinyalakan untuk semua orang secara default
--  (administrator tetap bisa mencabutnya per pengguna lewat Manajemen
--  Pengguna kalau perlu).
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT u.id, 'zecode', TRUE, FALSE, FALSE, FALSE
FROM users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM user_permissions) x
    WHERE x.user_id = u.id AND x.module_key = 'zecode'
  );
