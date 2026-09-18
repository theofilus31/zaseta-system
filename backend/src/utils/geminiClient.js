/**
 * ============================================================================
 *  KLIEN GEMINI (Google AI Studio — pengganti Ollama untuk Zecode)
 * ============================================================================
 *  Beda dari Ollama (model lokal), ini API pihak ketiga lewat internet:
 *  pesan pengguna terkirim ke server Google, dan (di free tier) ada batas
 *  jumlah permintaan per menit/hari — kalau terlampaui, Google balas HTTP
 *  429. Cek kuota & harga terbaru di https://ai.google.dev/pricing sebelum
 *  dipakai untuk hal yang lebih dari uji coba.
 *
 *  geminiChat() dibuat dengan tanda tangan (signature) yang SAMA persis
 *  dengan ollamaChat() bekas di ollamaClient.js, supaya pemanggilnya
 *  (zecodeIntents.js) cuma perlu ganti baris import.
 * ============================================================================
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

/** Ollama pakai roles system/user/assistant dalam satu array `messages`;
    Gemini pakai `systemInstruction` terpisah + roles user/model di `contents`.
    Konversi di sini supaya pemanggil tidak perlu tahu bedanya. */
function toGeminiPayload(messages) {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  return { systemText, contents };
}

/**
 * Kirim satu putaran percakapan ke Gemini, minta jawaban lengkap (bukan
 * streaming) — sama seperti Ollama, Zecode selalu memproses jawabannya
 * lebih dulu (parse JSON intent, dsb.) sebelum diteruskan ke pengguna.
 *
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @param {{ json?: boolean, temperature?: number }} options
 * @returns {Promise<string>} isi balasan model
 */
async function geminiChat(messages, { json = false, temperature = 0.3 } = {}) {
  if (!GEMINI_API_KEY) {
    const err = new Error(
      'GEMINI_API_KEY belum diisi di .env — buat API key gratis di https://aistudio.google.com/apikey'
    );
    err.status = 503;
    throw err;
  }

  const { systemText, contents } = toGeminiPayload(messages);

  let res;
  try {
    res = await fetch(
      `${GEMINI_HOST}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          contents,
          generationConfig: {
            temperature,
            responseMimeType: json ? 'application/json' : undefined,
          },
        }),
        // API di internet biasanya jauh lebih cepat dari model lokal, tapi
        // tetap dikasih ambang waktu supaya permintaan yang macet tidak
        // menggantung selamanya.
        signal: AbortSignal.timeout(60_000),
      }
    );
  } catch (err) {
    const wrapped = new Error(
      err.name === 'TimeoutError'
        ? 'Zecode tidak merespons dalam waktu wajar. Coba lagi sesaat lagi.'
        : 'Tidak bisa terhubung ke Gemini API. Cek koneksi internet server.'
    );
    wrapped.status = 503;
    throw wrapped;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const isQuota = res.status === 429;
    const err = new Error(
      isQuota
        ? 'Kuota gratis Gemini API sudah habis untuk saat ini. Coba lagi nanti.'
        : `Gemini merespons dengan galat (${res.status}): ${text.slice(0, 200)}`
    );
    err.status = isQuota ? 429 : 503;
    throw err;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** Sama seperti ollamaClient.js — dengan responseMimeType 'application/json'
    Gemini biasanya sudah keluarkan JSON bersih, tapi tetap dijaga kalau ada
    teks pembungkus (mis. blok ```json ... ```). */
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

module.exports = { geminiChat, extractJson, GEMINI_MODEL, GEMINI_HOST };
