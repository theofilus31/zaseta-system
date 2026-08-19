const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,

  /**
   * Kolom DATE dikembalikan sebagai STRING "YYYY-MM-DD", bukan objek Date.
   *
   * Tanpa ini, driver mengubah DATE jadi Date pada tengah malam WAKTU LOKAL,
   * lalu res.json() menuliskannya sebagai UTC. Di zona WIB (UTC+7),
   * 2024-03-12 berubah jadi "2024-03-11T17:00:00.000Z" — dan form di frontend
   * yang mengambil bagian tanggalnya membaca 11 Maret. Begitu disimpan, tanggal
   * itu benar-benar mundur sehari di database, dan mundur lagi setiap kali
   * asetnya disunting.
   *
   * DATE memang tidak punya komponen waktu, jadi memperlakukannya sebagai teks
   * adalah bentuk yang benar. Sengaja HANYA 'DATE' — DATETIME/TIMESTAMP
   * (created_at, updated_at, changed_at) dibiarkan sebagai objek Date karena
   * frontend memang memformatnya sebagai waktu lokal.
   */
  dateStrings: ['DATE'],
});

module.exports = pool;
