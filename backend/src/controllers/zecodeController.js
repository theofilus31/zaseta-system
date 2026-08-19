const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { handleMessage, INTENT_PERMISSION } = require('../services/zecodeIntents');
const { performCreateRequest } = require('./requestController');
const { userCan } = require('../middleware/auth');

/* Menghubungkan jenis aksi ke intent yang mengusulkannya, supaya izinnya
   bisa dicek ulang lewat INTENT_PERMISSION yang sama pada saat EKSEKUSI —
   bukan cuma dipercaya dari saat tawarannya dibuat. Kalau suatu saat
   ditambah jenis aksi baru, tambahkan pemetaannya di sini juga. */
const ACTION_INTENT = { create_request: 'create_request' };

/**
 * ============================================================================
 *  ZECODE — ASISTEN AI INTERNAL
 * ============================================================================
 *  Percakapan MILIK PRIBADI tiap pengguna — setiap kueri di sini
 *  mengunci ke `conversation_id ... WHERE user_id = req.user.id`, sama
 *  seperti pola IDOR-safe yang sudah dipakai di seluruh aplikasi ini
 *  (lampiran/pengingat/pemeliharaan yang dikunci ke asset_id induknya).
 * ============================================================================
 */

const TITLE_MAX_LENGTH = 60;
/* Batas panjang pesan yang dikirim ke Zecode — terpisah dari limit body JSON
   global (2mb di app.js, itu untuk SELURUH endpoint). Tanpa batas ini, pesan
   yang sangat panjang bisa lolos ke model AI lokal dan memperberat waktu
   inferensinya secara signifikan (terkait dengan pembatas laju di
   middleware/zecodeChatLimiter.js). 2000 karakter jauh lebih dari cukup untuk
   pertanyaan wajar. */
const MESSAGE_MAX_LENGTH = 2000;

function toTitle(message) {
  const trimmed = message.trim();
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed;
}

function toMessageItem(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    intent: row.intent,
    action: row.action_type
      ? { type: row.action_type, payload: typeof row.action_payload === 'string' ? JSON.parse(row.action_payload) : row.action_payload, status: row.action_status }
      : null,
    createdAt: row.created_at,
  };
}

// GET /api/zecode/conversations
const listConversations = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.updated_at,
            (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM chat_conversations c
     WHERE c.user_id = :userId
     ORDER BY c.updated_at DESC
     LIMIT 50`,
    { userId: req.user.id }
  );
  res.json(rows.map((r) => ({ id: r.id, title: r.title || 'Percakapan baru', lastMessage: r.last_message, updatedAt: r.updated_at })));
});

// GET /api/zecode/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [convRows] = await pool.query(
    `SELECT id, title FROM chat_conversations WHERE id = :id AND user_id = :userId`, { id, userId: req.user.id }
  );
  if (!convRows[0]) return res.status(404).json({ message: 'Percakapan tidak ditemukan.' });

  const [msgRows] = await pool.query(
    `SELECT * FROM chat_messages WHERE conversation_id = :id ORDER BY id ASC`, { id }
  );
  res.json({ id: convRows[0].id, title: convRows[0].title, messages: msgRows.map(toMessageItem) });
});

// DELETE /api/zecode/conversations/:id
const deleteConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `SELECT id FROM chat_conversations WHERE id = :id AND user_id = :userId`, { id, userId: req.user.id }
  );
  if (!rows[0]) return res.status(404).json({ message: 'Percakapan tidak ditemukan.' });

  await pool.query(`DELETE FROM chat_conversations WHERE id = :id`, { id });
  res.json({ message: 'Percakapan dihapus.' });
});

// POST /api/zecode/chat — { conversationId?, message }
const chat = asyncHandler(async (req, res) => {
  const { conversationId, message } = req.body;
  const trimmedMessage = String(message || '').trim();
  if (!trimmedMessage) return res.status(400).json({ message: 'Pesan tidak boleh kosong.' });
  if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    return res.status(400).json({ message: `Pesan terlalu panjang (maksimal ${MESSAGE_MAX_LENGTH} karakter).` });
  }

  let convId = conversationId;
  if (convId) {
    const [rows] = await pool.query(
      `SELECT id FROM chat_conversations WHERE id = :id AND user_id = :userId`, { id: convId, userId: req.user.id }
    );
    if (!rows[0]) return res.status(404).json({ message: 'Percakapan tidak ditemukan.' });
  } else {
    const [result] = await pool.query(
      `INSERT INTO chat_conversations (user_id, title) VALUES (:userId, :title)`,
      { userId: req.user.id, title: toTitle(trimmedMessage) }
    );
    convId = result.insertId;
  }

  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES (:convId, 'user', :content)`,
    { convId, content: trimmedMessage }
  );

  /* Riwayat singkat (10 pesan terakhir) diikutkan sebagai konteks — cukup
     untuk percakapan lanjutan ("dan yang di Warehouse?") tanpa membebani
     model lokal dengan konteks yang terlalu panjang. */
  const [historyRows] = await pool.query(
    `SELECT role, content FROM chat_messages WHERE conversation_id = :convId ORDER BY id DESC LIMIT 10`,
    { convId }
  );
  const history = historyRows.reverse().slice(0, -1).map((r) => ({ role: r.role, content: r.content }));

  /* Kalau Ollama tidak menyala/timeout, handleMessage() melempar error.
     Pesan pengguna yang sudah tersimpan di atas TETAP ada (supaya tidak
     hilang) — dulu kegagalan di sini membuat percakapan "menggantung" tanpa
     balasan sama sekali (pengguna yang reload melihat pesannya sendiri tanpa
     tanda apa pun bahwa itu gagal). Sekarang galatnya ikut disimpan sebagai
     balasan asisten bertipe error, supaya riwayatnya tetap jelas kalau dibuka
     lagi nanti — bukan cuma tampil sesaat lewat notifikasi yang bisa terlewat. */
  let result;
  try {
    result = await handleMessage({ userMessage: trimmedMessage, history, user: req.user });
  } catch (err) {
    const [insertResult] = await pool.query(
      `INSERT INTO chat_messages (conversation_id, role, content, intent, action_status)
       VALUES (:convId, 'assistant', :content, 'error', 'none')`,
      { convId, content: err.message || 'Zecode tidak bisa merespons sekarang.' }
    );
    await pool.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = :convId`, { convId });
    const [savedRows] = await pool.query(`SELECT * FROM chat_messages WHERE id = :id`, { id: insertResult.insertId });
    return res.status(err.status || 503).json({ conversationId: convId, message: toMessageItem(savedRows[0]) });
  }

  const [insertResult] = await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content, intent, action_type, action_payload, action_status)
     VALUES (:convId, 'assistant', :content, :intent, :actionType, :actionPayload, :actionStatus)`,
    {
      convId, content: result.text, intent: result.intent || null,
      actionType: result.action?.type || null,
      actionPayload: result.action ? JSON.stringify(result.action.payload) : null,
      actionStatus: result.action ? 'pending' : 'none',
    }
  );

  await pool.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = :convId`, { convId });

  const [savedRows] = await pool.query(`SELECT * FROM chat_messages WHERE id = :id`, { id: insertResult.insertId });

  res.json({ conversationId: convId, message: { ...toMessageItem(savedRows[0]), link: result.link } });
});

/** Ambil pesan bertipe aksi yang MASIH pending, sekaligus pastikan milik pengguna ini. */
async function loadPendingAction(messageId, userId) {
  const [rows] = await pool.query(
    `SELECT m.* FROM chat_messages m
     JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.id = :messageId AND c.user_id = :userId`,
    { messageId, userId }
  );
  const row = rows[0];
  if (!row) return { error: { code: 404, message: 'Pesan tidak ditemukan.' } };
  if (row.action_status !== 'pending') return { error: { code: 400, message: 'Tawaran aksi ini sudah tidak berlaku.' } };
  return { row };
}

// POST /api/zecode/messages/:id/confirm
const confirmAction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { row, error } = await loadPendingAction(id, req.user.id);
  if (error) return res.status(error.code).json({ message: error.message });

  if (row.action_type !== 'create_request') {
    return res.status(400).json({ message: 'Jenis aksi tidak dikenal.' });
  }

  /* Izin dicek ULANG di sini, bukan cuma dipercaya dari saat tawaran ini
     dibuat — kalau administrator mencabut izin pengguna SELAGI tawaran
     masih menunggu diklik, eksekusinya harus tetap ditolak. */
  const requiredPermission = INTENT_PERMISSION[ACTION_INTENT[row.action_type]];
  if (requiredPermission && !userCan(req.user, ...requiredPermission)) {
    return res.status(403).json({ message: 'Izin Anda untuk aksi ini sudah tidak berlaku.' });
  }

  const payload = typeof row.action_payload === 'string' ? JSON.parse(row.action_payload) : row.action_payload;

  let resultText;
  let newStatus = 'confirmed';
  try {
    const created = await performCreateRequest({
      ...payload, userId: req.user.id, ip: req.ip,
    });
    resultText = `Permintaan ${created.requestNo} berhasil diajukan untuk ${created.requesterName}. GA akan meninjaunya.`;
  } catch (err) {
    newStatus = 'cancelled';
    resultText = `Gagal mengajukan permintaan: ${err.message}`;
  }

  await pool.query(`UPDATE chat_messages SET action_status = :status WHERE id = :id`, { id, status: newStatus });

  const [insertResult] = await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content, intent) VALUES (:convId, 'assistant', :content, 'action_result')`,
    { convId: row.conversation_id, content: resultText }
  );
  await pool.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = :convId`, { convId: row.conversation_id });

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'zecode_action', entityId: id,
    newValues: { actionType: row.action_type, payload, result: newStatus }, ipAddress: req.ip,
  });

  const [savedRows] = await pool.query(`SELECT * FROM chat_messages WHERE id = :id`, { id: insertResult.insertId });
  res.json({ message: toMessageItem(savedRows[0]) });
});

// POST /api/zecode/messages/:id/cancel
const cancelAction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { row, error } = await loadPendingAction(id, req.user.id);
  if (error) return res.status(error.code).json({ message: error.message });

  await pool.query(`UPDATE chat_messages SET action_status = 'cancelled' WHERE id = :id`, { id });

  const [insertResult] = await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES (:convId, 'assistant', 'Baik, dibatalkan.')`,
    { convId: row.conversation_id }
  );
  await pool.query(`UPDATE chat_conversations SET updated_at = NOW() WHERE id = :convId`, { convId: row.conversation_id });

  const [savedRows] = await pool.query(`SELECT * FROM chat_messages WHERE id = :id`, { id: insertResult.insertId });
  res.json({ message: toMessageItem(savedRows[0]) });
});

module.exports = { listConversations, getConversation, deleteConversation, chat, confirmAction, cancelAction };
