/**
 * Parser CSV sederhana — cukup untuk kebutuhan import Lokasi/Sub Lokasi.
 * Mendukung field yang dibungkus tanda kutip ganda (untuk nilai yang mengandung koma).
 * Mengembalikan array of objects, key diambil dari baris header (case-insensitive, di-trim).
 */
function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const parseLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

module.exports = parseCsv;
