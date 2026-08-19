/**
 * ============================================================================
 *  KLIEN OLLAMA (model AI lokal untuk Zecode)
 * ============================================================================
 *  Ollama dijalankan sebagai layanan terpisah di komputer/server yang sama
 *  (bawaannya di http://localhost:11434) — BUKAN memanggil API AI pihak
 *  ketiga lewat internet. Konsekuensinya: tidak ada data perusahaan yang
 *  keluar dari server, tidak ada biaya per-pesan, tapi juga berarti Zecode
 *  TIDAK BERFUNGSI kalau layanan Ollama-nya sendiri tidak menyala — beda
 *  dari fitur lain di aplikasi ini yang semuanya berjalan dari satu proses
 *  Node yang sama.
 *
 *  Dipakai lewat endpoint /api/chat Ollama (bukan /api/generate) karena
 *  formatnya sudah berupa daftar pesan (system/user/assistant) — cocok
 *  dengan bentuk percakapan yang disimpan di chat_messages.
 * ============================================================================
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

/**
 * Kirim satu putaran percakapan ke Ollama, minta jawaban lengkap (bukan
 * streaming) — Zecode selalu memproses jawabannya lebih dulu (parse JSON
 * intent, dsb.) sebelum diteruskan ke pengguna, jadi streaming token demi
 * token tidak berguna di sini.
 *
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {{ json?: boolean, temperature?: number }} options
 * @returns {Promise<string>} isi balasan model
 */
async function ollamaChat(messages, { json = false, temperature = 0.3 } = {}) {
  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        format: json ? 'json' : undefined,
        options: { temperature },
      }),
      // Model lokal di CPU/GPU kelas menengah bisa perlu waktu — 90 detik
      // masih wajar untuk satu balasan sebelum dianggap macet.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const wrapped = new Error(
      err.name === 'TimeoutError'
        ? 'Zecode tidak merespons dalam waktu wajar. Model AI lokal mungkin sedang memuat — coba lagi sesaat lagi.'
        : `Tidak bisa terhubung ke layanan Ollama di ${OLLAMA_HOST}. Pastikan Ollama sedang berjalan.`
    );
    wrapped.status = 503;
    throw wrapped;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Ollama merespons dengan galat (${res.status}): ${text.slice(0, 200)}`);
    err.status = 503;
    throw err;
  }

  const data = await res.json();
  return data.message?.content ?? '';
}

/** Ollama tidak selalu menaati `format: 'json'` dengan sempurna — kadang
    membungkus JSON-nya dengan ```json ... ``` atau kalimat pengantar. Ini
    mengeluarkan blok JSON pertama yang ditemukan, apa pun bungkusnya. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

module.exports = { ollamaChat, extractJson, OLLAMA_MODEL, OLLAMA_HOST };
