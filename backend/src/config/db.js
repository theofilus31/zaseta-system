const { Pool, types } = require('pg');
require('dotenv').config();

/**
 * ============================================================================
 *  LAPISAN KOMPATIBILITAS mysql2 -> pg (migrasi PostgreSQL, backend Fase "lanjut")
 * ============================================================================
 *  Seluruh 27 controller di proyek ini memanggil database lewat BENTUK yang
 *  sama persis sejak awal ditulis untuk mysql2/promise:
 *    - `pool.query(sql, { namaParam: nilai })` — placeholder bernama `:nama`,
 *      BUKAN posisi `$1,$2` ala pg asli.
 *    - `const [rows] = await pool.query('SELECT ...')` — elemen pertama tuple
 *      untuk SELECT adalah ARRAY baris.
 *    - `const [result] = await pool.query('INSERT ...'); result.insertId`
 *      — elemen pertama tuple untuk INSERT/UPDATE/DELETE adalah SATU OBJEK
 *      berisi `insertId`/`affectedRows`, BUKAN array baris.
 *    - `pool.getConnection()` lalu `conn.beginTransaction()`/`conn.commit()`/
 *      `conn.rollback()`/`conn.release()` untuk transaksi manual.
 *
 *  Daripada menulis ulang ratusan titik pemanggilan itu, modul ini
 *  mengekspos API BENTUK YANG SAMA di atas `pg` (node-postgres) sungguhan —
 *  yang berubah HANYA teks SQL yang genuinely tidak kompatibel (ON DUPLICATE
 *  KEY UPDATE, DATE_ADD, dst. — lihat controller masing-masing), bukan cara
 *  memanggilnya. Ini BUKAN abstraksi database generik untuk mendukung banyak
 *  driver sekaligus — proyek ini sudah cutover penuh ke PostgreSQL, wrapper
 *  ini murni supaya konversinya tidak perlu menyentuh setiap controller.
 * ============================================================================
 */

/**
 * Kolom DATE dikembalikan sebagai STRING "YYYY-MM-DD", bukan objek Date —
 * padanan `dateStrings: ['DATE']` mysql2 yang sudah ada sebelumnya. Tanpa
 * ini, driver mengubah DATE jadi objek Date pada tengah malam WAKTU LOKAL,
 * lalu res.json() menuliskannya sebagai UTC. Di zona WIB (UTC+7),
 * 2024-03-12 berubah jadi "2024-03-11T17:00:00.000Z" — dan form di frontend
 * yang mengambil bagian tanggalnya membaca 11 Maret. DATE memang tidak
 * punya komponen waktu, jadi memperlakukannya sebagai teks adalah bentuk
 * yang benar. Sengaja HANYA oid 1082 (tipe `date` PostgreSQL) —
 * TIMESTAMP (created_at, updated_at, dst.) dibiarkan sebagai objek Date
 * karena frontend memang memformatnya sebagai waktu lokal.
 */
types.setTypeParser(1082, (value) => value);

const pgPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10, // padanan connectionLimit mysql2
});

/**
 * Ubah SQL berplaceholder bernama (`:nama`) jadi SQL berplaceholder posisi
 * (`$1,$2,...`) yang dimengerti `pg`, sekaligus membangun array nilainya
 * sesuai urutan kemunculan.
 *
 * Menelusuri karakter satu-satu (bukan regex sederhana) supaya DUA hal ini
 * tidak ikut salah kena ganti:
 *   1. `::` — operator CAST TIPE asli PostgreSQL (mis. `harga::numeric`),
 *      dibiarkan apa adanya, bukan dibaca sebagai awalan placeholder.
 *   2. Titik dua di DALAM string berkutip tunggal (mis. literal waktu
 *      `'12:30:00'` kalau suatu saat ada) — tidak pernah dianggap
 *      placeholder, sama seperti perilaku parser named-placeholder mysql2
 *      yang sudah dipakai proyek ini sejak awal.
 */
function namedToPositional(sql, params = {}) {
  const values = [];
  let text = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'") {
      // Salin seluruh string berkutip tunggal apa adanya, termasuk escape '' di dalamnya.
      text += ch;
      i++;
      while (i < sql.length) {
        text += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { text += sql[i + 1]; i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === ':' && sql[i + 1] === ':') {
      text += '::';
      i += 2;
      continue;
    }

    if (ch === ':' && /[a-zA-Z_]/.test(sql[i + 1] || '')) {
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const name = sql.slice(i + 1, j);
      if (!(name in params)) {
        throw new Error(`Parameter bernama ":${name}" tidak ditemukan di objek params yang dioper ke query.`);
      }
      values.push(params[name]);
      text += `$${values.length}`;
      i = j;
      continue;
    }

    text += ch;
    i++;
  }

  return { text, values };
}

const MUTATION_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE)\b/i;
const HAS_RETURNING = /\bRETURNING\b/i;

/**
 * Jalankan satu query lewat `executor` (pool `pg` biasa, atau satu client
 * transaksi dari `pool.connect()`) dan bentuk hasilnya PERSIS seperti
 * balikan mysql2:
 *   - SELECT/WITH  -> [rows, fields]
 *   - INSERT/UPDATE/DELETE -> [{ affectedRows, insertId }, fields]
 *     `insertId` diisi dari kolom PERTAMA baris PERTAMA hasil `RETURNING`
 *     kalau statement-nya memangnya membawa klausa itu — inilah yang
 *     membuat 41 titik `result.insertId` di seluruh controller TETAP JALAN
 *     tanpa disentuh, cukup teks SQL INSERT-nya ditambah `RETURNING id`.
 */
async function runQuery(executor, sql, params = {}) {
  const { text, values } = namedToPositional(sql, params);
  const result = await executor.query(text, values);

  if (MUTATION_KEYWORDS.test(text)) {
    const header = { affectedRows: result.rowCount, insertId: undefined };
    if (HAS_RETURNING.test(text) && result.rows[0]) {
      const firstKey = Object.keys(result.rows[0])[0];
      header.insertId = result.rows[0][firstKey];
    }
    return [header, result.fields];
  }

  return [result.rows, result.fields];
}

/**
 * `pool.getConnection()` — shim di atas `pgPool.connect()` sungguhan, supaya
 * 6 berkas yang mengontrol transaksi manual (`conn.beginTransaction()`/
 * `conn.commit()`/`conn.rollback()`/`conn.release()`, termasuk pola
 * `externalConn` opsional di assignmentController.js) tidak perlu ubah kode
 * kontrol transaksinya sama sekali.
 */
async function getConnection() {
  const client = await pgPool.connect();
  return {
    query: (sql, params) => runQuery(client, sql, params),
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release(),
  };
}

module.exports = {
  query: (sql, params) => runQuery(pgPool, sql, params),
  getConnection,
  // Dipakai HANYA oleh tests/ (lihat tests/helpers/teardown.js) supaya proses
  // `node --test` benar-benar keluar setelah selesai — pg.Pool membiarkan
  // koneksinya terbuka tanpa ini, jadi Node menganggap event loop masih
  // "hidup" dan tidak pernah keluar sendiri. TIDAK dipanggil di jalur
  // aplikasi sungguhan (server.js) sama sekali.
  end: () => pgPool.end(),
};
