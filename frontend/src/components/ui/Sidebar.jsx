import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cva } from 'class-variance-authority';
import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn.js';

/**
 * Primitif sidebar — port dari komponen Sidebar TailGrids (aslinya dibangun di
 * atas react-aria-components + @floating-ui/react). Arsitekturnya dipertahankan
 * sama persis: context + provider, status "expanded/collapsed" tersimpan di
 * cookie, pintasan keyboard Cmd/Ctrl+B, mode ciut-ke-ikon, varian tombol lewat
 * cva. Yang diganti hanya lapisan dependensinya supaya cocok dengan proyek ini:
 * tanpa react-aria-components (overlay mobile pakai pola panel-geser yang
 * sudah dipakai di Zaseta), tanpa @floating-ui/react (tooltik mode-ikon cukup
 * CSS group-hover karena sidebar selalu menempel di tepi kiri layar — tidak
 * perlu deteksi tabrakan posisi). Warna & kerapatan visual mengikuti token
 * Zaseta sendiri (brand/ink/info), bukan skema warna TailGrids.
 */

const SIDEBAR_COOKIE_NAME = 'sidebar:state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
/* Disamakan dengan breakpoint `lg` Tailwind (1024px) supaya konsisten dengan
   titik ganti tata letak yang sudah dipakai Layout/TabBar/BottomTabBar. */
const MOBILE_BREAKPOINT = 1024;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

const SidebarContext = createContext(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar harus dipakai di dalam <SidebarProvider>');
  return context;
}

export function SidebarProvider({ defaultOpen = true, open: openProp, onOpenChange, className, style, children, ...props }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [openState, setOpenState] = useState(() => {
    if (typeof document === 'undefined') return defaultOpen;
    const match = document.cookie.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`));
    return match ? match[1] === 'true' : defaultOpen;
  });
  const open = openProp ?? openState;

  const setOpen = useCallback(
    (value) => {
      const next = typeof value === 'function' ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else setOpenState(next);
      if (typeof document !== 'undefined') {
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      }
    },
    [open, onOpenChange]
  );

  const toggleSidebar = useCallback(
    () => (isMobile ? setOpenMobile((v) => !v) : setOpen((v) => !v)),
    [isMobile, setOpen]
  );

  /* Cmd/Ctrl+B — sama seperti komponen aslinya */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const state = open ? 'expanded' : 'collapsed';

  const value = useMemo(
    () => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>
      {/* display:contents — hanya membawa custom property CSS & context, tidak
          menambah kotak baru di susunan flex Layout. Custom property tetap
          diwariskan ke turunan walau elemen ini tidak ikut tata letak. */}
      <div
        style={{
          '--sidebar-width': '17rem',
          '--sidebar-width-icon': '3.75rem',
          '--sidebar-width-mobile': '18rem',
          ...style,
        }}
        className={cn('contents', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function SidebarTrigger({ className, onClick, ...props }) {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      aria-label={state === 'expanded' ? 'Ciutkan sidebar' : 'Perluas sidebar'}
      title={state === 'expanded' ? 'Ciutkan sidebar' : 'Perluas sidebar'}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-lg text-brand-300 hover:bg-white/10 hover:text-white transition-colors shrink-0',
        className
      )}
      {...props}
    >
      <i className={`fas ${state === 'expanded' ? 'fa-angles-left' : 'fa-angles-right'} text-[11px]`} aria-hidden="true" />
    </button>
  );
}

/**
 * Sidebar (root). `collapsible="icon"` (bawaan) meniru "mode ciut" TailGrids;
 * `collapsible="none"` melepas semua perilaku ciut/overlay (dipakai kalau
 * suatu saat sidebar perlu ditanam statis di tempat lain).
 */
export function Sidebar({ side = 'left', collapsible = 'icon', className, children, ...props }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return (
      <div
        data-sidebar="sidebar"
        className={cn('flex h-full flex-col', className)}
        style={{ width: 'var(--sidebar-width)' }}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={cn('fixed inset-0 z-40', openMobile ? '' : 'pointer-events-none')}>
        <div
          className={cn(
            'absolute inset-0 bg-ink-900/50 backdrop-blur-sm transition-opacity duration-200',
            openMobile ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setOpenMobile(false)}
          aria-hidden="true"
        />
        <div
          data-sidebar="sidebar"
          data-mobile="true"
          className={cn(
            'absolute inset-y-0 flex flex-col shadow-overlay max-w-[82vw]',
            'transition-transform duration-200 ease-out',
            side === 'left' ? 'left-0' : 'right-0',
            openMobile ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full',
            className
          )}
          style={{ width: 'var(--sidebar-width-mobile)' }}
          {...props}
        >
          {children}
        </div>
      </div>
    );
  }

  const collapsed = state === 'collapsed' && collapsible === 'icon';

  return (
    <div
      data-sidebar="sidebar"
      data-state={state}
      data-side={side}
      className={cn('hidden lg:flex h-full flex-col shrink-0', 'transition-[width] duration-200 ease-linear', className)}
      style={{ width: collapsed ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)' }}
      {...props}
    >
      {children}
    </div>
  );
}

/* Tanpa arah flex bawaan (beda dari Content/Footer yang selalu kolom) —
   pemanggilnya (layout/Sidebar.jsx) butuh baris (logo-nama-tombol ciutkan
   sejajar), dan cn() proyek ini cuma menggabung kelas, bukan menyelesaikan
   konflik seperti tailwind-merge. Kalau flex-col dipatok di sini dan
   pemanggil menambahkan items-center, dua arah flex itu akan tabrakan di
   stylesheet — persis bug yang pernah bikin logo & nama malah bertumpuk. */
export function SidebarHeader({ className, ...props }) {
  return <div data-sidebar="header" className={cn('shrink-0', className)} {...props} />;
}

export function SidebarContent({ className, ...props }) {
  return (
    <div
      data-sidebar="content"
      className={cn('flex-1 flex flex-col overflow-y-auto overscroll-contain scrollbar-slim min-h-0', className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }) {
  return <div data-sidebar="footer" className={cn('flex flex-col shrink-0', className)} {...props} />;
}

export function SidebarMenu({ className, ...props }) {
  return <ul data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col', className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }) {
  return <li data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />;
}

/* Bantalan-x TIDAK dipatok di dalam `size` — dulu size.default sudah
   membawa px-3, dan pemanggil menambahkan 'px-0' sendiri saat ciut lewat
   className. cn() proyek ini cuma menggabung kelas (bukan tailwind-merge),
   jadi px-3 & px-0 sama-sama nyangkut di daftar kelas sekaligus; yang
   menang cuma kebetulan urutan stylesheet Tailwind, bukan jaminan. Di sini
   bantalan-x jadi bagian `compoundVariants` sendiri per (size, collapsed) —
   hanya SATU nilai px-* yang pernah berlaku untuk kombinasi mana pun. */
export const sidebarMenuButtonVariants = cva(
  'relative flex w-full items-center overflow-hidden rounded-lg text-left outline-none transition-colors duration-150 ' +
    'focus-visible:ring-2 focus-visible:ring-brand-300/60 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'gap-3 py-2.5 text-[13.5px]',
        sm: 'gap-2.5 py-2 text-xs',
        lg: 'gap-3 py-3 text-sm',
      },
      active: {
        true: 'bg-white/10 text-white font-semibold',
        false: 'text-brand-200 font-medium hover:bg-white/5 hover:text-white',
      },
      collapsed: {
        true: 'justify-center px-0',
        false: '',
      },
    },
    compoundVariants: [
      { collapsed: false, size: 'default', class: 'px-3' },
      { collapsed: false, size: 'sm', class: 'px-2.5' },
      { collapsed: false, size: 'lg', class: 'px-3' },
    ],
    defaultVariants: { size: 'default', active: false, collapsed: false },
  }
);

/* Tooltik mode-ikon — sidebar selalu menempel di tepi kiri jadi arahnya
   selalu ke kanan, tidak perlu deteksi tabrakan posisi ala floating-ui.
   Tapi TETAP perlu di-portal ke document.body: pembungkusnya (SidebarContent)
   punya overflow-y-auto untuk gulir menu, dan menurut spesifikasi CSS,
   overflow-x otomatis ikut "auto" begitu overflow-y bukan "visible" —
   tanpa portal, tooltik yang melebar ke kanan akan terpotong rapat oleh
   batas gulir itu. */
function MenuButtonTooltip({ collapsed, tooltip, children }) {
  const anchorRef = useRef(null);
  const [pos, setPos] = useState(null);

  if (!tooltip || !collapsed) return children;

  function show() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }
  function hide() {
    setPos(null);
  }

  return (
    <span ref={anchorRef} className="block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg
                       bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-raised"
          >
            {tooltip}
          </span>,
          document.body
        )}
    </span>
  );
}

export function SidebarMenuButton({
  to,
  end,
  active,
  tooltip,
  size = 'default',
  showActiveBar = true,
  className,
  children,
  onClick,
  ...props
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;

  function handleClick(e) {
    onClick?.(e);
    if (isMobile) setOpenMobile(false);
  }

  function body(isActive) {
    return (
      <>
        {isActive && showActiveBar && !collapsed && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-400" aria-hidden="true" />
        )}
        {children}
      </>
    );
  }

  if (to) {
    return (
      <MenuButtonTooltip collapsed={collapsed} tooltip={tooltip}>
        <NavLink
          to={to}
          end={end}
          onClick={handleClick}
          className={({ isActive }) =>
            cn(sidebarMenuButtonVariants({ size, active: isActive, collapsed }), className)
          }
          {...props}
        >
          {({ isActive }) => body(isActive)}
        </NavLink>
      </MenuButtonTooltip>
    );
  }

  return (
    <MenuButtonTooltip collapsed={collapsed} tooltip={tooltip}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(sidebarMenuButtonVariants({ size, active, collapsed }), className)}
        {...props}
      >
        {body(active)}
      </button>
    </MenuButtonTooltip>
  );
}
