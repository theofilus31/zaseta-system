// Error handler global — diletakkan paling akhir di app.js
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;

  /* err.status HANYA diset oleh kode kita sendiri saat sengaja melempar error
     dengan pesan yang memang ditujukan untuk dibaca pengguna (pola
     `const err = new Error('...'); err.status = 400; throw err;` yang
     dipakai di banyak controller). Error TANPA .status berarti sesuatu yang
     tidak terduga — paling sering error mentah dari driver MySQL — dan
     pesannya sering menyebutkan nama tabel/kolom/constraint internal
     (mis. "Duplicate entry '...' for key 'assets.uq_asset_code'"). Itu
     tidak boleh diteruskan apa adanya ke klien; rinciannya sudah tercatat
     lewat console.error di atas untuk ditelusuri langsung dari log server. */
  const message = err.status
    ? err.message
    : 'Terjadi kesalahan pada server. Coba lagi sesaat lagi, atau hubungi administrator kalau terus berulang.';

  res.status(status).json({ message });
}

module.exports = errorHandler;
