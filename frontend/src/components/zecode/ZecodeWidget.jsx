import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button.jsx';
import { FAQ_CATEGORIES, searchFaq } from '../../constants/chatbotFaq.js';

/**
 * ============================================================================
 *  ZECODE — CHATBOT PANDUAN (STATIS)
 * ============================================================================
 *  Bukan AI: semua pertanyaan & jawaban ditulis di constants/chatbotFaq.js,
 *  tanpa panggilan ke server. Pengguna memilih pertanyaan dari daftar, atau
 *  mengetik bebas lalu dicocokkan ke kata kunci (searchFaq).
 *
 *  Tombol mengambang muncul di SEMUA halaman berkerangka (lewat Layout.jsx)
 *  untuk semua pengguna yang sudah masuk — isinya panduan umum, bukan data
 *  perusahaan, jadi tidak perlu izin menu khusus.
 * ============================================================================
 */

const MESSAGE_MAX_LENGTH = 200;

/** Ubah **tebal**, `kode`, dan baris baru jadi elemen JSX ringan. */
function renderRichText(text) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={j}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={j} className="rounded bg-white/70 px-1 py-0.5 text-[12px]">{part.slice(1, -1)}</code>;
      }
      return <React.Fragment key={j}>{part}</React.Fragment>;
    });
    return <p key={i} className={line.trim() === '' ? 'h-2' : ''}>{parts}</p>;
  });
}

export default function ZecodeWidget() {
  const [open, setOpen] = useState(false);

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

const GREETING = 'Halo! Aku Zecode, asisten panduan Zaseta. Pilih pertanyaan di bawah, atau ketik pertanyaanmu — aku carikan jawabannya.';

function ZecodePanel({ onClose }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [view, setView] = useState('menu'); // menu | chat
  const [categoryKey, setCategoryKey] = useState(FAQ_CATEGORIES[0].key);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [messages, view]);

  const category = FAQ_CATEGORIES.find((c) => c.key === categoryKey) || FAQ_CATEGORIES[0];

  function push(...items) {
    setMessages((m) => [...m, ...items.map((it) => ({ id: ++seq.current, ...it }))]);
  }

  function askItem(item) {
    push({ role: 'user', content: item.q }, { role: 'assistant', content: item.a, links: item.links, related: [] });
    setView('chat');
  }

  function askFreeText(text) {
    const { best, related } = searchFaq(text);
    if (best) {
      push({ role: 'user', content: text }, { role: 'assistant', content: best.a, links: best.links, related });
    } else {
      push(
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: 'Maaf, aku belum punya jawaban untuk itu. Coba kata kunci lain (mis. "impor", "QR", "kata sandi"), atau pilih dari daftar pertanyaan. Untuk hal lain, hubungi administrator perusahaanmu.',
          links: [],
          related: [],
        },
      );
    }
    setView('chat');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    askFreeText(text);
  }

  function reset() {
    setMessages([]);
    setView('menu');
    inputRef.current?.focus();
  }

  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-40 sm:w-[23rem] sm:h-[34rem] flex flex-col bg-white sm:rounded-2xl border border-ink-200/70 shadow-overlay overflow-hidden animate-slide-up sm:animate-scale-in">
      {/* Kop */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 shrink-0 bg-gradient-to-r from-brand-600 to-info-600">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <i className="fas fa-robot text-white text-sm" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white leading-tight">Zecode</p>
          <p className="text-[10px] text-white/75 leading-tight">Asisten panduan penggunaan Zaseta</p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} title="Mulai dari awal" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors">
            <i className="fas fa-rotate-left text-white/90 text-xs" aria-hidden="true" />
          </button>
        )}
        <button onClick={onClose} title="Tutup" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors sm:hidden lg:flex">
          <i className="fas fa-xmark text-white/90 text-sm" aria-hidden="true" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-slim p-3 space-y-3">
        {view === 'menu' ? (
          <>
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-ink-100 text-ink-800 px-3.5 py-2.5 text-[13px] leading-relaxed">
                {GREETING}
              </div>
            </div>

            {/* Kategori */}
            <div className="flex flex-wrap gap-1.5">
              {FAQ_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategoryKey(c.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    c.key === categoryKey
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  <i className={`fas ${c.icon} text-[10px]`} aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>

            {/* Pertanyaan pada kategori terpilih */}
            <ul className="space-y-1.5">
              {category.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => askItem(item)}
                    className="w-full text-left rounded-xl border border-ink-200 px-3 py-2.5 text-[13px] text-ink-700 leading-snug hover:border-brand-300 hover:bg-brand-50/50 transition-colors"
                  >
                    {item.q}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onAsk={askItem}
                onNavigate={(to) => { navigate(to); onClose?.(); }}
              />
            ))}
            <button
              onClick={() => setView('menu')}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[11px] font-medium text-ink-500 hover:border-brand-300 hover:text-brand-700 transition-colors"
            >
              <i className="fas fa-list text-[10px]" aria-hidden="true" /> Lihat daftar pertanyaan
            </button>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-ink-200/70 p-2.5 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ketik kata kunci, mis. impor CSV…"
          maxLength={MESSAGE_MAX_LENGTH}
          className="field flex-1 !py-2.5"
        />
        <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Kirim">
          <i className="fas fa-paper-plane text-xs" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MessageBubble({ message, onAsk, onNavigate }) {
  if (message.role === 'user') {
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
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-ink-100 text-ink-800 px-3.5 py-2.5 text-[13px] leading-relaxed">
        <div className="space-y-0.5">{renderRichText(message.content)}</div>

        {message.links?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {message.links.map((l) => (
              <button
                key={l.to}
                onClick={() => onNavigate(l.to)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-700 hover:text-brand-800"
              >
                Buka {l.label} <i className="fas fa-arrow-right text-[9px]" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {message.related?.length > 0 && (
          <div className="mt-3 border-t border-ink-200 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Mungkin maksudmu</p>
            <div className="space-y-1">
              {message.related.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAsk(item)}
                  className="block w-full text-left rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-ink-700 hover:bg-brand-50 transition-colors"
                >
                  {item.q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
