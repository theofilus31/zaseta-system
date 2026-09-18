/**
 * ============================================================================
 *  BACKUP DATABASE — pg_dump terjadwal
 * ============================================================================
 *  Kalau Postgres-nya di-hosting layanan terkelola (Railway/Supabase/Neon/
 *  RDS/dst.), CEK DULU apakah mereka sudah menyediakan backup otomatis
 *  bawaan sebelum memakai skrip ini — kalau sudah, skrip ini cuma duplikat.
 *  Skrip ini untuk Postgres yang Anda kelola sendiri (VPS, mesin lokal),
 *  yang TIDAK datang dengan backup otomatis apa pun secara default.
 *
 *  Butuh `pg_dump` di PATH — satu paket dengan instalasi PostgreSQL (client
 *  tools). Kalau servernya tidak menjalankan Postgres secara lokal, install
 *  cuma client tools-nya saja (tidak perlu server Postgres penuh):
 *    - Ubuntu/Debian: apt install postgresql-client
 *    - Windows: installer PostgreSQL resmi, pilih cuma "Command Line Tools"
 *
 *  Jalankan manual : node scripts/backupDatabase.js
 *  Jalankan lewat  : npm run backup   (lihat package.json)
 *
 *  Menjadwalkan otomatis:
 *    - Linux/macOS (cron), tiap hari jam 3 pagi:
 *        0 3 * * * cd /path/ke/backend && /usr/bin/node scripts/backupDatabase.js >> backups/backup.log 2>&1
 *    - Windows (Task Scheduler): buat task baru, action "Start a program",
 *      program `node.exe`, argumen `scripts/backupDatabase.js`,
 *      "Start in" diisi folder `backend` ini.
 *
 *  Format `.dump` (custom, terkompresi) — pulihkan dengan:
 *    pg_restore -U <user> -d <database_kosong_baru> --clean --if-exists backups/<file>.dump
 *  (BUKAN `psql -f`, itu untuk format teks polos, bukan custom format ini.)
 *
 *  Retensi: menyimpan 14 backup terbaru, sisanya otomatis dihapus setelah
 *  backup baru berhasil dibuat — supaya folder ini tidak tumbuh tanpa batas
 *  kalau dijadwalkan tiap hari. Sesuaikan RETENTION_COUNT kalau perlu lebih/
 *  kurang, atau pindahkan backup lama ke penyimpanan luar (S3/Drive/dst.)
 *  sendiri kalau butuh retensi jangka panjang — skrip ini tidak melakukan itu.
 * ============================================================================
 */
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RETENTION_COUNT = 14;
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runPgDump(outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', process.env.DB_HOST || 'localhost',
      '-p', String(process.env.DB_PORT || 5432),
      '-U', process.env.DB_USER || 'postgres',
      '-Fc', // custom format -- terkompresi, bisa restore sebagian lewat pg_restore
      '-f', outFile,
      process.env.DB_NAME,
    ];

    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
    });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          '"pg_dump" tidak ditemukan di PATH. Install PostgreSQL client tools ' +
          '(lihat komentar di atas skrip ini untuk cara instal per OS), lalu coba lagi.'
        ));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump keluar dengan kode ${code}: ${stderr.trim()}`));
    });
  });
}

function pruneOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.dump'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(RETENTION_COUNT);
  for (const f of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log(`Backup lama dihapus (melewati batas ${RETENTION_COUNT}): ${f.name}`);
  }
}

async function main() {
  if (!process.env.DB_NAME) {
    throw new Error('DB_NAME tidak diset di .env — jalankan skrip ini dari folder backend/ dengan .env yang sudah diisi.');
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const fileName = `zentra-${process.env.DB_NAME}-${timestamp()}.dump`;
  const outFile = path.join(BACKUP_DIR, fileName);

  console.log(`Membuat backup "${process.env.DB_NAME}" -> backups/${fileName} ...`);
  await runPgDump(outFile);

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`Backup selesai (${sizeKb} KB).`);

  pruneOldBackups();
}

main().catch((err) => {
  console.error('Backup GAGAL:', err.message);
  process.exit(1);
});
