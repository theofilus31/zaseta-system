const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { calculateDepreciation } = require('../utils/depreciation');
const { todayLocal } = require('../utils/dateLocal');
const { toCsvCell } = require('../utils/csv');

/**
 * ============================================================================
 *  LAPORAN PENYUSUTAN PER PERIODE / DEPARTEMEN
 * ============================================================================
 *  Dasbor sudah menampilkan nilai buku HARI INI, tapi bagian keuangan/auditor
 *  sering butuh angka pada tanggal TERTENTU di masa lalu ("berapa nilai buku
 *  aset IT per akhir Maret 2026, untuk laporan kuartalan?"), dan dipecah per
 *  departemen — dua hal yang tidak bisa dijawab dashboard.
 *
 *  Rekonstruksi kepemilikan "per tanggal X": sebuah aset dihitung sebagai
 *  MASIH DIMILIKI pada tanggal itu kalau sudah dibeli sebelum/pada tanggal
 *  itu, dan (kalau sekarang sudah terjual/hilang/dihapuskan) pelepasannya
 *  terjadi SETELAH tanggal itu — supaya laporan periode lalu tidak diam-diam
 *  kehilangan aset yang baru saja dilepas minggu ini.
 *
 *  Penyusutannya sendiri memakai calculateDepreciation() yang sama dipakai
 *  halaman detail aset — cuma parameter "sekarang"-nya diganti tanggal
 *  laporan, bukan ditulis ulang sebagai rumus SQL terpisah yang gampang
 *  melenceng dari perhitungan yang sudah dipercaya di tempat lain.
 * ============================================================================
 */

function parseAsOfDate(raw) {
  if (!raw) return todayLocal();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return raw;
}

/** Baris aset yang "ada" (dimiliki) pada asOfDate, dengan filter opsional. */
async function fetchOwnedAssets({ tenantId, asOfDate, departmentId, categoryId }) {
  const conditions = [
    'a.tenant_id = :tenantId',
    'a.deleted_at IS NULL',
    'a.purchase_date IS NOT NULL',
    'a.purchase_date <= :asOfDate',
    `(
      a.status NOT IN ('terjual','hilang','dihapuskan')
      OR (a.status = 'terjual' AND a.sold_date IS NOT NULL AND a.sold_date > :asOfDate)
      OR (a.status IN ('hilang','dihapuskan') AND a.retired_date IS NOT NULL AND a.retired_date > :asOfDate)
    )`,
  ];
  const params = { tenantId, asOfDate };

  if (departmentId) { conditions.push('a.department_id = :departmentId'); params.departmentId = departmentId; }
  if (categoryId) { conditions.push('a.category_id = :categoryId'); params.categoryId = categoryId; }

  const [rows] = await pool.query(
    `SELECT a.id, a.asset_code, a.name, a.purchase_date, a.purchase_price, a.useful_life_months, a.salvage_value,
            d.id AS department_id, d.code AS department_code, d.name AS department_name,
            c.name AS category_name
     FROM assets a
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN asset_categories c ON c.id = a.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.name IS NULL, d.name ASC, a.asset_code ASC`,
    params
  );
  return rows;
}

// GET /api/reports/depreciation?asOfDate=&departmentId=&categoryId=
const getDepreciationReport = asyncHandler(async (req, res) => {
  const { departmentId, categoryId } = req.query;
  const asOfDate = parseAsOfDate(req.query.asOfDate);
  if (!asOfDate) return res.status(400).json({ message: 'Tanggal laporan tidak valid.' });

  const assets = await fetchOwnedAssets({ tenantId: req.user.tenant_id, asOfDate, departmentId, categoryId });

  const groups = new Map(); // key: departmentId ?? 'none'
  for (const a of assets) {
    const key = a.department_id ?? 'none';
    if (!groups.has(key)) {
      groups.set(key, {
        departmentId: a.department_id,
        departmentCode: a.department_code,
        departmentName: a.department_name || 'Tanpa Departemen',
        assetCount: 0,
        acquisitionValue: 0,
        accumulatedDepreciation: 0,
        bookValue: 0,
      });
    }
    const g = groups.get(key);
    const dep = calculateDepreciation(a, asOfDate);
    const price = Number(a.purchase_price) || 0;

    g.assetCount += 1;
    g.acquisitionValue += price;
    if (dep) {
      g.accumulatedDepreciation += dep.accumulated;
      g.bookValue += dep.bookValue;
    } else {
      /* Tidak punya masa manfaat/nilai residu -> dianggap tidak menyusut,
         nilai bukunya sama dengan harga beli. Konsisten dengan cara Dasbor
         memperlakukan aset semacam ini. */
      g.bookValue += price;
    }
  }

  const byDepartment = [...groups.values()].sort((x, y) => x.departmentName.localeCompare(y.departmentName, 'id'));

  const summary = byDepartment.reduce((acc, g) => ({
    assetCount: acc.assetCount + g.assetCount,
    acquisitionValue: acc.acquisitionValue + g.acquisitionValue,
    accumulatedDepreciation: acc.accumulatedDepreciation + g.accumulatedDepreciation,
    bookValue: acc.bookValue + g.bookValue,
  }), { assetCount: 0, acquisitionValue: 0, accumulatedDepreciation: 0, bookValue: 0 });

  res.json({
    asOfDate,
    summary: {
      ...summary,
      acquisitionValue: Math.round(summary.acquisitionValue),
      accumulatedDepreciation: Math.round(summary.accumulatedDepreciation),
      bookValue: Math.round(summary.bookValue),
    },
    byDepartment: byDepartment.map((g) => ({
      ...g,
      acquisitionValue: Math.round(g.acquisitionValue),
      accumulatedDepreciation: Math.round(g.accumulatedDepreciation),
      bookValue: Math.round(g.bookValue),
    })),
  });
});

// GET /api/reports/depreciation/export?asOfDate=&departmentId=&categoryId= — rincian per aset (CSV)
const exportDepreciationReport = asyncHandler(async (req, res) => {
  const { departmentId, categoryId } = req.query;
  const asOfDate = parseAsOfDate(req.query.asOfDate);
  if (!asOfDate) return res.status(400).json({ message: 'Tanggal laporan tidak valid.' });

  const assets = await fetchOwnedAssets({ tenantId: req.user.tenant_id, asOfDate, departmentId, categoryId });

  const headers = [
    'Kode Aset', 'Nama Aset', 'Kode Barang/Aset', 'Departemen',
    'Tanggal Beli', 'Harga Beli', 'Masa Manfaat (bulan)', 'Bulan Berjalan',
    'Akumulasi Penyusutan', 'Nilai Buku',
  ];

  const lines = [headers.join(',')];
  for (const a of assets) {
    const dep = calculateDepreciation(a, asOfDate);
    const price = Number(a.purchase_price) || 0;
    lines.push([
      a.asset_code, a.name, a.category_name, a.department_name || 'Tanpa Departemen',
      a.purchase_date, price,
      a.useful_life_months || '', dep ? dep.monthsElapsed : '',
      dep ? dep.accumulated : 0, dep ? dep.bookValue : price,
    ].map(toCsvCell).join(','));
  }

  await logAudit({
    userId: req.user.id, action: 'export', entityType: 'depreciation_report',
    newValues: { asOfDate, departmentId, categoryId, jumlahBaris: assets.length }, ipAddress: req.ip,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="penyusutan-${asOfDate}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

module.exports = { getDepreciationReport, exportDepreciationReport };
