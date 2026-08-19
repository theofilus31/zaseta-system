const multer = require('multer');

// Simpan file di memori (bukan disk) — cukup untuk file CSV kecil, tidak perlu bersih-bersih file sementara.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // maks 2MB, lebih dari cukup untuk ribuan baris CSV
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      const err = new Error('File harus berformat .csv');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = upload;
