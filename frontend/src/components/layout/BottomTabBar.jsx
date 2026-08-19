import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { navItems } from './Sidebar.jsx';

/**
 * Tab bawah untuk layar sempit. Hanya menampilkan menu yang paling sering
 * dipakai staf sehari-hari; sisanya tetap terjangkau lewat laci "Menu".
 * Label sengaja dipendekkan supaya muat tanpa terpotong.
 */
const MOBILE_TABS = [
  { to: '/dashboard', short: 'Dasbor' },
  { to: '/assets', short: 'Aset' },
  { to: '/cetak-barcode-massal', short: 'Cetak' },
];

export default function BottomTabBar({ onMoreClick }) {
  const { can } = useAuth();

  const items = MOBILE_TABS
    .map((tab) => {
      const item = navItems.find((n) => n.to === tab.to);
      return item ? { ...item, short: tab.short } : null;
    })
    .filter((item) => item && can(item.module, 'view'));

  const tabClass = ({ isActive }) =>
    [
      'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium',
      'transition-colors relative',
      isActive ? 'text-brand-600' : 'text-ink-400 hover:text-ink-600',
    ].join(' ');

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-ink-200/70
                 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigasi cepat"
    >
      <div className="flex items-stretch">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={tabClass}>
            {({ isActive }) => (
              <>
                {/* Garis penanda tab aktif, menempel di tepi atas */}
                {isActive && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-brand-500 to-info-500" aria-hidden="true" />
                )}
                <i className={`fas ${item.icon} text-base`} aria-hidden="true" />
                {item.short}
              </>
            )}
          </NavLink>
        ))}

        <button onClick={onMoreClick} className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium text-ink-400 hover:text-ink-600 transition-colors">
          <i className="fas fa-ellipsis text-base" aria-hidden="true" />
          Menu
        </button>
      </div>
    </nav>
  );
}
