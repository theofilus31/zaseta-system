const { ollamaChat, extractJson } = require('../utils/ollamaClient');
const { userCan } = require('../middleware/auth');
const zecodeData = require('./zecodeData');

/**
 * ============================================================================
 *  KLASIFIKASI MAKSUD PESAN (INTENT)
 * ============================================================================
 *  Zecode TIDAK memakai tool-calling bebas ala agen otonom — daftar intent-
 *  nya TERTUTUP (cuma yang didefinisikan di sini) dan setiap intent dipetakan
 *  ke SATU fungsi pengambil data yang sudah pasti aman (lihat zecodeData.js).
 *  Ini pilihan desain yang disengaja: model bahasa lokal 7B tidak cukup
 *  andal untuk orkestrasi tool multi-langkah yang terbuka, dan yang dijawab
 *  Zecode di sini menyangkut data perusahaan sungguhan — jadi jalur yang
 *  bisa ditempuh model harus sempit dan bisa diprediksi, bukan bebas.
 *
 *  Tugas model AI di sini HANYA: baca pesan pengguna (+ riwayat percakapan
 *  singkat), pilih SATU intent dari daftar yang diizinkan, dan keluarkan
 *  JSON. Tidak pernah diminta mengarang jawaban tentang data sistem.
 * ============================================================================
 */

/** module & aksi yang harus dimiliki pengguna supaya SATU intent ini boleh dipakai. */
const INTENT_PERMISSION = {
  asset_search: ['assets', 'view'],
  asset_detail: ['assets', 'view'],
  holder_lookup: ['assets', 'view'],
  warranty_soon: ['assets', 'view'],
  low_stock: ['consumables', 'view'],
  pending_requests: ['requests', 'view'],
  dashboard_summary: ['dashboard', 'view'],
  create_request: ['requests', 'create'],
};

const INTENT_DESCRIPTION = {
  asset_search: 'Mencari daftar aset berdasarkan kata kunci/status/kondisi. params: {"keyword": string|null, "status": "dijual"|"terjual"|"dipindah"|"dipakai"|"idle"|"hilang"|"dihapuskan"|null, "condition": "baik"|"rusak_ringan"|"rusak_berat"|null}',
  asset_detail: 'Detail SATU aset tertentu berdasarkan nama/kode. params: {"keyword": string}',
  holder_lookup: 'Mencari aset apa saja yang sedang dipegang SESEORANG. params: {"holder_name": string}',
  warranty_soon: 'Daftar aset yang garansinya akan/sudah berakhir. params: {}',
  low_stock: 'Daftar barang habis pakai yang stoknya menipis/habis. params: {}',
  pending_requests: 'Daftar permintaan aset yang masih menunggu ditinjau. params: {}',
  dashboard_summary: 'Ringkasan umum sistem: jumlah aset, nilai, dsb. params: {}',
  create_request: 'Mengajukan PERMINTAAN aset BARU atas nama seseorang (bukan mengubah data yang sudah ada). params: {"item_name": string, "requester_name": string, "department": string|null, "priority": "rendah"|"sedang"|"tinggi"|null, "reason": string|null}',
  greeting: 'Sapaan, basa-basi, ucapan terima kasih, atau obrolan umum yang tidak menyangkut data sistem. params: {}',
  help: 'Pengguna bertanya apa saja yang bisa dilakukan Zecode. params: {}',
  unknown: 'Pertanyaan di luar cakupan (bukan tentang data sistem ini, atau tidak jelas maksudnya). params: {}',
};

function buildSystemPrompt(allowedIntents) {
  const catalog = allowedIntents.map((key) => `- "${key}": ${INTENT_DESCRIPTION[key]}`).join('\n');

  return `Kamu adalah Zecode, asisten AI internal untuk sistem inventaris aset perusahaan. Kamu berjalan LOKAL di server perusahaan sendiri, bukan layanan luar.

Tugasmu HANYA SATU: baca pesan terakhir pengguna, lalu putuskan SATU intent dari daftar berikut yang paling cocok, dan keluarkan HANYA JSON (tidak ada teks lain sebelum/sesudahnya):

${catalog}

Format keluaran WAJIB persis seperti ini:
{"intent": "<salah satu kunci di atas>", "params": { ... sesuai skema intent itu ... }}

Aturan penting:
- Pengguna ini HANYA boleh diberi salah satu dari ${allowedIntents.length} intent di atas. Kalau permintaannya menyangkut sesuatu di luar itu (mis. menghapus data, mengubah status, laporan keuangan rinci), pakai intent "unknown".
- Kalau pesan pengguna adalah sapaan/basa-basi/terima kasih, pakai intent "greeting".
- Kalau pengguna bertanya apa yang bisa kamu lakukan, pakai intent "help".
- Isi params HANYA dari apa yang benar-benar disebutkan pengguna. Jangan mengarang nilai yang tidak disebutkan — biarkan null/kosong.
- SELALU balas dalam Bahasa Indonesia untuk field apa pun yang berisi teks bebas.
- JANGAN PERNAH menjawab pertanyaan tentang data sistem secara langsung — itu bukan tugasmu, tugasmu cuma memilih intent. Sistem lain yang akan mengambil data sungguhan dan menjawabnya.`;
}

/** Basa-basi/sapaan dijawab model secara langsung (bukan lewat data) — ini aman karena tidak menyangkut data sistem. */
async function directReply(userMessage, kind) {
  const prompt = kind === 'help'
    ? 'Pengguna bertanya apa yang bisa kamu lakukan. Jawab singkat (maksimal 4 kalimat) dalam Bahasa Indonesia, ramah, sebagai Zecode — asisten AI internal sistem inventaris aset yang berjalan lokal di server perusahaan.'
    : 'Balas pesan pengguna secara singkat, ramah, dan natural dalam Bahasa Indonesia, sebagai Zecode — asisten AI internal sistem inventaris aset.';

  const reply = await ollamaChat([
    { role: 'system', content: prompt },
    { role: 'user', content: userMessage },
  ], { json: false, temperature: 0.6 });

  return reply.trim() || 'Baik!';
}

/**
 * Alur utama: klasifikasi intent lewat model, lalu jalankan (atau siapkan
 * tawaran aksi) sesuai izin NYATA pengguna — bukan cuma percaya daftar
 * intent yang diberikan ke model, dicek ULANG di sini sebagai lapis kedua.
 *
 * @returns {{ text: string, link?: string, intent: string, action?: { type: string, payload: object } }}
 */
async function handleMessage({ userMessage, history, user }) {
  const allowedIntents = Object.keys(INTENT_PERMISSION).filter(
    (key) => userCan(user, ...INTENT_PERMISSION[key])
  );
  // Sapaan/bantuan/tak dikenal selalu boleh, tidak menyentuh data apa pun.
  const fullCatalog = [...allowedIntents, 'greeting', 'help', 'unknown'];

  const systemPrompt = buildSystemPrompt(fullCatalog);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const raw = await ollamaChat(messages, { json: true, temperature: 0.1 });
  const parsed = extractJson(raw);

  const intent = parsed?.intent && fullCatalog.includes(parsed.intent) ? parsed.intent : 'unknown';
  const params = parsed?.params && typeof parsed.params === 'object' ? parsed.params : {};

  // Lapis kedua: sekalipun model "lupa" batasannya, intent yang tidak
  // diizinkan untuk pengguna ini TETAP ditolak di sini, bukan cuma dipercaya
  // dari instruksi prompt.
  if (INTENT_PERMISSION[intent] && !userCan(user, ...INTENT_PERMISSION[intent])) {
    return { intent: 'unknown', text: 'Maaf, kamu tidak memiliki izin untuk melihat data itu.' };
  }

  if (intent === 'greeting' || intent === 'help') {
    return { intent, text: await directReply(userMessage, intent) };
  }

  if (intent === 'unknown') {
    return {
      intent,
      text: 'Maaf, aku belum bisa membantu untuk itu. Aku bisa membantu cari data aset, cek stok barang habis pakai, lihat permintaan aset yang tertunda, atau mengajukan permintaan aset baru. Coba tanyakan salah satu dari itu.',
    };
  }

  if (intent === 'create_request') {
    // Aksi TIDAK dijalankan di sini — cuma disiapkan sebagai tawaran yang
    // butuh konfirmasi eksplisit dari pengguna (lihat zecodeController).
    return {
      intent,
      text: `Aku siapkan pengajuan permintaan aset berikut. Cek dulu rinciannya, lalu tekan "Ajukan" kalau sudah sesuai.`,
      action: {
        type: 'create_request',
        payload: {
          itemName: params.item_name || null,
          requesterName: params.requester_name || user.name,
          department: params.department || null,
          priority: ['rendah', 'sedang', 'tinggi'].includes(params.priority) ? params.priority : 'sedang',
          reason: params.reason || null,
        },
      },
    };
  }

  // Sisanya: intent baca data — jalankan pengambil data yang sesuai.
  const handler = zecodeData[intent];
  if (!handler) return { intent: 'unknown', text: 'Maaf, aku belum bisa membantu untuk itu.' };

  const result = await handler(params);
  return { intent, text: result.text, link: result.link };
}

module.exports = { handleMessage, INTENT_PERMISSION };
