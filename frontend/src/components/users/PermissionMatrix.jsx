import React from 'react';
import { MODULES, MODULE_GROUPS, ACTION_LABEL, ACTION_HINT } from '../../constants/modules.js';

/**
 * Matriks "menu × aksi" untuk menentukan hak akses satu pengguna.
 *
 * Nilai dipegang sebagai { moduleKey: ['view','create',...] } — bentuk yang
 * sama persis dengan yang dikirim ke dan diterima dari server, jadi tidak ada
 * penerjemahan bentuk data di tengah jalan.
 *
 * Aturan yang ditegakkan di sini (dan diulang lagi di backend):
 *   - mencentang aksi apa pun otomatis menyalakan "Lihat", karena tidak masuk
 *     akal mengubah data di menu yang tidak boleh dibuka
 *   - mematikan "Lihat" mematikan seluruh aksi di menu itu
 */
export default function PermissionMatrix({ value = {}, onChange, disabled = false }) {
  const has = (moduleKey, action) => Boolean(value[moduleKey]?.includes(action));

  function toggle(moduleKey, action) {
    if (disabled) return;

    const current = value[moduleKey] || [];
    let next;

    if (action === 'view') {
      // Mematikan "Lihat" berarti mencabut seluruh akses ke menu itu
      next = current.includes('view') ? [] : ['view'];
    } else if (current.includes(action)) {
      next = current.filter((a) => a !== action);
    } else {
      next = [...new Set([...current, 'view', action])];
    }

    const updated = { ...value };
    if (next.length === 0) delete updated[moduleKey];
    else updated[moduleKey] = next;

    onChange(updated);
  }

  function toggleGroup(group, on) {
    if (disabled) return;

    const updated = { ...value };
    for (const m of MODULES.filter((x) => x.group === group)) {
      if (on) updated[m.key] = [...m.actions];
      else delete updated[m.key];
    }
    onChange(updated);
  }

  const totalSelected = Object.keys(value).length;

  return (
    <div className={disabled ? 'opacity-60 pointer-events-none select-none' : ''}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-ink-500">
          <span className="font-semibold text-ink-700 tabular-nums">{totalSelected}</span> dari {MODULES.length} menu dipilih
        </p>
        {!disabled && totalSelected > 0 && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-[11px] font-medium text-ink-400 hover:text-danger-600 transition-colors"
          >
            Kosongkan semua
          </button>
        )}
      </div>

      <div className="space-y-4">
        {MODULE_GROUPS.map((group) => {
          const mods = MODULES.filter((m) => m.group === group);
          if (mods.length === 0) return null;

          const allOn = mods.every((m) => has(m.key, 'view'));

          return (
            <div key={group} className="rounded-xl border border-ink-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-ink-50 px-3.5 py-2.5 border-b border-ink-200">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{group}</p>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group, !allOn)}
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    {allOn ? 'Batalkan semua' : 'Pilih semua'}
                  </button>
                )}
              </div>

              <div className="divide-y divide-ink-100">
                {mods.map((m) => {
                  const active = has(m.key, 'view');
                  return (
                    <div
                      key={m.key}
                      className={`px-3.5 py-3 transition-colors ${active ? 'bg-white' : 'bg-ink-50/40'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            active ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400'
                          }`}
                        >
                          <i className={`fas ${m.icon} text-[12px]`} aria-hidden="true" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-semibold ${active ? 'text-ink-800' : 'text-ink-500'}`}>
                            {m.label}
                          </p>
                          <p className="text-[11px] text-ink-400 leading-relaxed mt-0.5">{m.description}</p>

                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {m.actions.map((action) => {
                              const on = has(m.key, action);
                              const isView = action === 'view';
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => toggle(m.key, action)}
                                  title={ACTION_HINT[action]}
                                  aria-pressed={on}
                                  className={[
                                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium',
                                    'border transition-colors',
                                    on
                                      ? isView
                                        ? 'bg-info-50 border-info-300 text-info-700'
                                        : 'bg-brand-50 border-brand-300 text-brand-700'
                                      : 'bg-white border-ink-200 text-ink-400 hover:border-ink-300 hover:text-ink-600',
                                  ].join(' ')}
                                >
                                  <i
                                    className={`fas ${on ? 'fa-check' : 'fa-xmark'} text-[9px]`}
                                    aria-hidden="true"
                                  />
                                  {ACTION_LABEL[action]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
