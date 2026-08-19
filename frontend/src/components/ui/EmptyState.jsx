import React from 'react';

/**
 * Keadaan kosong. Sengaja selalu menawarkan langkah berikutnya (`action`)
 * kalau ada, supaya pengguna tidak berhenti di jalan buntu.
 */
export default function EmptyState({
  title,
  description,
  action,
  icon = 'fa-box-open',
  tone = 'neutral',
  className = '',
}) {
  const iconTone = {
    neutral: 'bg-ink-100 text-ink-400',
    brand: 'bg-brand-50 text-brand-500',
    warning: 'bg-warning-50 text-warning-500',
    danger: 'bg-danger-50 text-danger-500',
  }[tone] || 'bg-ink-100 text-ink-400';

  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}>
      <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 ${iconTone}`}>
        <i className={`fas ${icon} text-xl`} aria-hidden="true" />
      </div>
      <p className="text-[15px] font-semibold text-ink-700">{title}</p>
      {description && (
        <p className="text-sm text-ink-400 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
