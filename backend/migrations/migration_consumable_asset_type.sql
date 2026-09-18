-- ============================================================================
--  SATUKAN KATEGORI BARANG HABIS PAKAI DENGAN "KATEGORI ASET" (asset_types)
-- ============================================================================
--  Sebelumnya barang habis pakai punya sistem kategori SENDIRI yang terpisah
--  dan tidak bisa dikelola tenant (consumables.category, VARCHAR terkunci ke
--  4 pilihan: atk/kebersihan/it_supplies/lainnya). Ini sistem kategori KETIGA
--  dalam aplikasi, di luar "Kode Barang/Aset" (asset_categories) dan
--  "Kategori Aset" (asset_types) yang sudah dipakai Daftar Aset — membingungkan
--  dan tidak konsisten (tenant tidak bisa menambah kategori baru untuk barang
--  habis pakai, beda dari aset yang bebas).
--
--  Sekarang disatukan: barang habis pakai memakai asset_types yang SAMA
--  dengan aset (satu daftar kategori dikelola dari satu tempat, termasuk
--  lewat tombol "+ Buat Baru" di kedua form). Kolom `category` lama dihapus
--  sepenuhnya (bukan dipertahankan sebagai kolom mati) -- lihat
--  consumableController.js untuk pemakaiannya sekarang.
--
--  Backfill di bawah membuatkan baris asset_types yang sepadan (kalau belum
--  ada) untuk tiap label kategori lama yang MASIH DIPAKAI, per tenant, lalu
--  memetakan consumables.asset_type_id ke situ -- supaya barang yang sudah
--  ada tidak kehilangan kategorinya begitu saja.
-- ============================================================================

ALTER TABLE consumables ADD COLUMN asset_type_id BIGINT NULL REFERENCES asset_types(id) ON DELETE SET NULL;
CREATE INDEX idx_consumable_asset_type ON consumables(asset_type_id);

INSERT INTO asset_types (tenant_id, name)
SELECT DISTINCT c.tenant_id,
  CASE c.category WHEN 'atk' THEN 'ATK' WHEN 'kebersihan' THEN 'Kebersihan' WHEN 'it_supplies' THEN 'Perlengkapan IT' ELSE 'Lainnya' END
FROM consumables c
WHERE NOT EXISTS (
  SELECT 1 FROM asset_types at
  WHERE at.tenant_id = c.tenant_id
    AND at.name = CASE c.category WHEN 'atk' THEN 'ATK' WHEN 'kebersihan' THEN 'Kebersihan' WHEN 'it_supplies' THEN 'Perlengkapan IT' ELSE 'Lainnya' END
);

UPDATE consumables c
SET asset_type_id = at.id
FROM asset_types at
WHERE at.tenant_id = c.tenant_id
  AND at.name = CASE c.category WHEN 'atk' THEN 'ATK' WHEN 'kebersihan' THEN 'Kebersihan' WHEN 'it_supplies' THEN 'Perlengkapan IT' ELSE 'Lainnya' END;

-- Menghapus kolom otomatis ikut menghapus CHECK constraint-nya (tidak perlu DROP CONSTRAINT terpisah).
ALTER TABLE consumables DROP COLUMN category;
