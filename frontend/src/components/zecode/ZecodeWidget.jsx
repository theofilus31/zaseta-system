import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import axiosClient from '../../api/axiosClient.js';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';

/**
 * ============================================================================
 *  ZECODE — WIDGET CHAT AI INTERNAL
 * ============================================================================
 *  Zecode berjalan LOKAL lewat Ollama di server aplikasi ini sendiri — bukan
 *  layanan AI pihak luar. Widget ini cuma antarmukanya; seluruh pemahaman
 *  bahasa dan pengambilan data terjadi di backend (lihat
 *  backend/src/services/zecodeIntents.js dan zecodeData.js).
 *
 *  Tombol mengambang muncul di SEMUA halaman berkerangka (lewat Layout.jsx)
 *  untuk pengguna yang punya izin `zecode.view` — sama seperti lonceng
 *  Pemberitahuan, ini alat bantu lintas halaman. Ia disembunyikan sendiri
 *  di halaman /zecode (lihat pages/ZecodePage.jsx) karena panel yang sama
 *  sudah tampil penuh di sana lewat `ZecodePanel` yang diekspor di bawah.
 * ============================================================================
 */

/** Harus sama dengan MESSAGE_MAX_LENGTH di backend/src/controllers/zecodeController.js
    — ini cuma mencegah pengetikan berlebih di sisi tampilan, batas sesungguhnya
    tetap ditegakkan di server. */
const MESSAGE_MAX_LENGTH = 2000;

/** Ubah **tebal** dan baris baru dari balasan Zecode jadi elemen JSX ringan
    tanpa perlu pustaka markdown penuh — balasannya sengaja sederhana. */
function renderRichText(text) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={j}>{part}</React.Fragment>
    );
    return <p key={i} className={line.trim() === '' ? 'h-2' : ''}>{parts}</p>;
  });
}

export default function ZecodeWidget() {
  const { can } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!can('zecode', 'view')) return null;
  if (location.pathname === '/zecode') return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Tutup Zecode' : 'Buka Zecode'}
        className={`fixed z-40 bottom-20 right-4 lg:bottom-6 lg:right-6 h-14 w-14 rounded-full shadow-overlay
                   flex items-center justify-center transition-all duration-200
                   ${open ? 'bg-ink-700 rotate-90' : 'bg-gradient-to-br from-brand-500 to-info-600 hover:scale-105'}`}
      >
        <i className={`fas ${open ? 'fa-xmark' : 'fa-robot'} text-white text-xl`} aria-hidden="true" />
      </button>

      {open && <ZecodePanel onClose={() => setOpen(false)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** variant='floating' — popover mengambang (dipakai ZecodeWidget). variant='page' —
    mengisi kartu halaman penuh (dipakai pages/ZecodePage.jsx), tanpa tombol tutup. */
export function ZecodePanel({ onClose, variant = 'floating' }) {
  const isPage = variant === 'page';
  const navigate = useNavigate();
  const { pushError } = useNotification();

  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, sending, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, [showHistory]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await axiosClient.get('/zecode/conversations');
      setConversations(res.data);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  async function openConversation(id) {
    try {
      const res = await axiosClient.get(`/zecode/conversations/${id}`);
      setConversationId(id);
      setMessages(res.data.messages);
      setShowHistory(false);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membuka percakapan.');
    }
  }

  function startNew() {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }

  async function handleDeleteConversation(e, id) {
    e.stopPropagation();
    try {
      await axiosClient.delete(`/zecode/conversations/${id}`);
      if (id === conversationId) startNew();
      loadConversations();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus percakapan.');
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }]);
    setSending(true);

    try {
      const res = await axiosClient.post('/zecode/chat', { conversationId, message: text });
      setConversationId(res.data.conversationId);
      setMessages((m) => [...m, res.data.message]);
      loadConversations();
    } catch (err) {
      /* Kalau Ollama gagal/timeout, backend TETAP menyimpan pesan galat itu
         sebagai balasan asisten sungguhan (lihat zecodeController.js) — body
         responsnya berbentuk sama seperti respons sukses ({ conversationId,
         message }), cuma status HTTP-nya bukan 2xx. Pakai isi itu apa adanya
         supaya percakapan yang dibuka lagi nanti tetap menunjukkan riwayat
         yang jelas, bukan cuma notifikasi sesaat yang gampang terlewat.
         Fallback di bawah cuma untuk galat jaringan yang benar-benar tidak
         sempat sampai ke backend (mis. server backend itu sendiri mati). */
      const data = err.response?.data;
      if (data?.message && typeof data.message === 'object') {
        if (data.conversationId) setConversationId(data.conversationId);
        setMessages((m) => [...m, data.message]);
        loadConversations();
      } else {
        setMessages((m) => [...m, {
          id: `err-${Date.now()}`, role: 'assistant', intent: 'error',
          content: data?.message || 'Zecode tidak bisa merespons sekarang. Pastikan layanan AI lokal (Ollama) sedang berjalan.',
        }]);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm(messageId) {
    setMessages((m) => m.map((msg) => (msg.id === messageId ? { ...msg, action: { ...msg.action, status: 'confirmed' } } : msg)));
    try {
      const res = await axiosClient.post(`/zecode/messages/${messageId}/confirm`);
      setMessages((m) => [...m, res.data.message]);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menjalankan aksi.');
      loadConversations();
    }
  }

  async function handleCancel(messageId) {
    setMessages((m) => m.map((msg) => (msg.id === messageId ? { ...msg, action: { ...msg.action, status: 'cancelled' } } : msg)));
    try {
      const res = await axiosClient.post(`/zecode/messages/${messageId}/cancel`);
      setMessages((m) => [...m, res.data.message]);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan aksi.');
    }
  }

  return (
    <div
      className={isPage
        ? 'flex flex-col bg-white rounded-2xl border border-ink-200/70 shadow-card overflow-hidden h-[calc(100dvh-13rem)] sm:h-[calc(100dvh-12rem)]'
        : 'fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-40 sm:w-[23rem] sm:h-[34rem] flex flex-col bg-white sm:rounded-2xl border border-ink-200/70 shadow-overlay overflow-hidden animate-slide-up sm:animate-scale-in'}
    >
      {/* Kop */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 shrink-0 bg-gradient-to-r from-brand-600 to-info-600">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <i className="fas fa-robot text-white text-sm" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white leading-tight">Zecode</p>
          <p className="text-[10px] text-white/75 leading-tight">Asisten AI lokal · tidak terkirim ke luar</p>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          title="Riwayat percakapan"
          className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${showHistory ? 'bg-white/25' : 'hover:bg-white/15'}`}
        >
          <i className="fas fa-clock-rotate-left text-white/90 text-xs" aria-hidden="true" />
        </button>
        <button onClick={startNew} title="Percakapan baru" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors">
          <i className="fas fa-plus text-white/90 text-xs" aria-hidden="true" />
        </button>
        {!isPage && (
          <button onClick={onClose} title="Tutup" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors sm:hidden lg:flex">
            <i className="fas fa-xmark text-white/90 text-sm" aria-hidden="true" />
          </button>
        )}
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto scrollbar-slim p-2">
          {conversations === null ? (
            <p className="text-center text-xs text-ink-400 py-8">Memuat…</p>
          ) : conversations.length === 0 ? (
            <EmptyState icon="fa-comments" title="Belum ada percakapan" description="Mulai obrolan baru untuk bertanya ke Zecode." className="py-10" />
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openConversation(c.id)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 transition-colors ${
                      c.id === conversationId ? 'bg-brand-50' : 'hover:bg-ink-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-800 truncate">{c.title}</p>
                      {c.lastMessage && <p className="text-[11px] text-ink-400 truncate mt-0.5">{c.lastMessage}</p>}
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(e, c.id)}
                      title="Hapus percakapan"
                      className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                    >
                      <i className="fas fa-trash-can text-[10px]" aria-hidden="true" />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-slim p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 px-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 mb-3">
                  <i className="fas fa-robot text-lg" aria-hidden="true" />
                </span>
                <p className="text-[13px] font-medium text-ink-700">Halo! Aku Zecode.</p>
                <p className="text-xs text-ink-400 mt-1 leading-relaxed">
                  Tanyakan seputar aset, stok barang, atau permintaan yang tertunda — mis. "aset apa saja yang rusak berat?" atau "stok apa yang menipis?"
                </p>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onConfirm={handleConfirm} onCancel={handleCancel} onNavigate={(to) => { navigate(to); onClose?.(); }} />
            ))}

            {sending && (
              <div className="flex items-center gap-1.5 px-3 py-2 text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-pulse [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-300 animate-pulse [animation-delay:0.3s]" />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="shrink-0 border-t border-ink-200/70 p-2.5 flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya Zecode…"
              maxLength={MESSAGE_MAX_LENGTH}
              className="field flex-1 !py-2.5"
              disabled={sending}
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim()}>
              <i className="fas fa-paper-plane text-xs" aria-hidden="true" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MessageBubble({ message, onConfirm, onCancel, onNavigate }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 text-white px-3.5 py-2.5 text-[13px] leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className={`max-w-[90%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed ${
        message.isError || message.intent === 'error' ? 'bg-danger-50 text-danger-700' : 'bg-ink-100 text-ink-800'
      }`}>
        <div className="space-y-0.5">{renderRichText(message.content)}</div>

        {message.link && (
          <button
            onClick={() => onNavigate(message.link)}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:text-brand-800"
          >
            Buka halaman terkait <i className="fas fa-arrow-right text-[9px]" aria-hidden="true" />
          </button>
        )}

        {message.action && <ActionCard action={message.action} onConfirm={() => onConfirm(message.id)} onCancel={() => onCancel(message.id)} />}
      </div>
    </div>
  );
}

const ACTION_FIELD_LABEL = {
  itemName: 'Barang', requesterName: 'Peminta', department: 'Departemen',
  priority: 'Prioritas', reason: 'Alasan',
};
const PRIORITY_LABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };

function ActionCard({ action, onConfirm, onCancel }) {
  if (action.type !== 'create_request') return null;

  const p = action.payload;
  const rows = [
    ['itemName', p.itemName], ['requesterName', p.requesterName],
    ['department', p.department], ['priority', PRIORITY_LABEL[p.priority] || p.priority], ['reason', p.reason],
  ].filter(([, v]) => v);

  return (
    <div className="mt-2.5 rounded-xl border border-ink-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Usulan Permintaan Aset</p>
      <dl className="space-y-1 mb-3">
        {rows.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-[12px]">
            <dt className="text-ink-400 shrink-0 w-20">{ACTION_FIELD_LABEL[key]}</dt>
            <dd className="text-ink-700 font-medium min-w-0">{value}</dd>
          </div>
        ))}
      </dl>

      {action.status === 'pending' && (
        <div className="flex gap-2">
          <Button size="xs" variant="secondary" onClick={onCancel} className="flex-1 justify-center">Batal</Button>
          <Button size="xs" onClick={onConfirm} className="flex-1 justify-center">Ajukan</Button>
        </div>
      )}
      {action.status === 'confirmed' && (
        <p className="text-[11px] text-brand-600 font-medium"><i className="fas fa-check-circle mr-1" aria-hidden="true" />Diajukan</p>
      )}
      {action.status === 'cancelled' && (
        <p className="text-[11px] text-ink-400"><i className="fas fa-xmark-circle mr-1" aria-hidden="true" />Dibatalkan</p>
      )}
    </div>
  );
}
