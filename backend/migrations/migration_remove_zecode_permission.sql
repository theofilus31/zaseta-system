-- Zecode AI (chatbot berbasis Gemini) diganti chatbot panduan statis yang
-- tidak punya menu/izin sendiri lagi. Baris izin lama untuk modul 'zecode'
-- dibersihkan supaya tidak tertinggal di matriks izin.
--
-- Tabel chat_conversations & chat_messages SENGAJA tidak dihapus di sini
-- (riwayat obrolan lama) -- aplikasi tidak lagi membaca/menulisnya; hapus
-- manual dengan DROP TABLE kalau memang tidak diperlukan.
DELETE FROM user_permissions WHERE module_key = 'zecode';
