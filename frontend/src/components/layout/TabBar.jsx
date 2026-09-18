import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { X, Plus, Menu, MoreHorizontal, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { useTabs } from '../../context/TabsContext.jsx';
import { useSidebar } from '../ui/Sidebar.jsx';
import { NAV_ICONS, DEFAULT_NAV_ICON } from '../../constants/navIcons.js';
import { MODULES } from '../../constants/modules.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '../ui/ContextMenu.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/DropdownMenu.jsx';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/HoverCard.jsx';
import AttentionCenter from './AttentionCenter.jsx';
import NotificationHistoryDropdown from './NotificationHistoryDropdown.jsx';

/**
 * Port dari ChromeTab / NewTabButton / bar tab milik sidebar-with-chrome-
 * like-tabs — susunan, interaksi (klik tengah untuk tutup, menu klik-kanan,
 * geser urutan, panel "Quick Open" tekan-tahan/hover) dipertahankan sama
 * persis. Yang diadaptasi: token warna (ink/brand, bukan token shadcn),
 * ikon modul lucide-react per halaman (bukan lima NavItem tetap — Zaseta
 * punya puluhan rute), dan overlay laci mobile memakai punya Zaseta sendiri
 * (lewat toggleSidebar()) alih-alih komponen Sheet terpisah, supaya tidak
 * ada dua sistem laci yang saling bersaing.
 */

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function ChromeTab({ tab, isActive, isLast, canClose, hasRightNeighborActive, onTabClick, onTabClose, onCloseOthers, onCloseToRight, onCloseToLeft, hasOtherTabs, hasTabsToRight, hasTabsToLeft }) {
  const Icon = NAV_ICONS[tab.iconKey] || DEFAULT_NAV_ICON;
  const tabRef = useRef(null);

  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      if (isLast) {
        setTimeout(() => {
          const plusBtn = tabRef.current?.closest('.flex')?.querySelector('.new-tab-btn');
          plusBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 250);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isLast]);

  useEffect(() => {
    if (isActive && tabRef.current) {
      setTimeout(() => tabRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' }), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAuxClick(e) {
    if (e.button === 1 && canClose) {
      e.preventDefault();
      onTabClose();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTabClick();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && canClose) {
      e.preventDefault();
      onTabClose();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.target.closest('li')?.nextElementSibling?.querySelector('[role="tab"]')?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.target.closest('li')?.previousElementSibling?.querySelector('[role="tab"]')?.focus();
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          role="tab"
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          ref={tabRef}
          onClick={onTabClick}
          onAuxClick={handleAuxClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'relative flex items-center gap-2 px-4 py-2.5 ml-[10px] sm:ml-0 text-sm cursor-pointer transition-colors duration-150',
            'min-w-[140px] max-w-[220px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
            isActive ? 'text-ink-800' : 'text-ink-400 hover:text-ink-700'
          )}
        >
          {isActive && (
            <motion.div className="absolute inset-0 bg-white rounded-t-xl" layoutId="activeTabBg" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}>
              <div className="absolute -left-3 bottom-0 h-3 w-3 overflow-hidden">
                <div className="absolute right-0 bottom-0 h-6 w-6 rounded-full bg-ink-50 z-[1]" />
                <div className="absolute inset-0 bg-white" />
              </div>
              <div className="absolute -right-3 bottom-0 h-3 w-3 overflow-hidden">
                <div className="absolute left-0 bottom-0 h-6 w-6 rounded-full bg-ink-50 z-[1]" />
                <div className="absolute inset-0 bg-white" />
              </div>
            </motion.div>
          )}

          <div className="relative flex flex-1 min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate select-none font-medium">{tab.label}</span>

            {canClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(); }}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors',
                  isActive ? 'text-ink-400 hover:bg-ink-100 hover:text-ink-700' : 'opacity-0 group-hover:opacity-100 text-ink-400 hover:bg-ink-100 hover:text-ink-700'
                )}
                aria-label="Tutup tab"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {!isActive && !hasRightNeighborActive && (
            <div className="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-ink-200" />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onTabClose} disabled={!canClose}>Tutup Tab</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCloseOthers} disabled={!hasOtherTabs}>Tutup Tab Lainnya</ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight} disabled={!hasTabsToRight}>
          <ChevronRight className="mr-2 h-4 w-4" />Tutup Tab di Kanan
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseToLeft} disabled={!hasTabsToLeft}>
          <ChevronLeft className="mr-2 h-4 w-4" />Tutup Tab di Kiri
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NewTabButton({ onAddTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const lastTouchTime = useRef(0);
  const { can } = useAuth();

  const quickOpenItems = MODULES.filter((m) => can(m.key, 'view'));

  function handleTouchStart() {
    lastTouchTime.current = Date.now();
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      setIsOpen(true);
    }, 500);
  }

  function handleTouchEnd() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleClick(e) {
    const isTouch = Date.now() - lastTouchTime.current < 1000;
    if (isTouch) {
      if (isLongPress.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      setIsOpen(false);
      onAddTab();
    } else {
      onAddTab();
    }
  }

  return (
    <HoverCard
      open={isOpen}
      onOpenChange={(open) => {
        const isTouch = Date.now() - lastTouchTime.current < 1000;
        if (open && isTouch && !isLongPress.current) return;
        setIsOpen(open);
      }}
      openDelay={200}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <button
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="new-tab-btn ml-1 mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          aria-label="Tab baru"
        >
          <Plus className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-60 p-1" sideOffset={8}>
        <div className="px-2 py-1.5 text-xs font-medium text-ink-400">Buka Cepat</div>
        {quickOpenItems.map((item) => {
          const Icon = NAV_ICONS[item.key] || DEFAULT_NAV_ICON;
          return (
            <button
              key={item.key}
              onClick={() => onAddTab(item.key)}
              className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-100"
            >
              <Icon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </HoverCardContent>
    </HoverCard>
  );
}

export default function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, closeOthers, closeToRight, closeToLeft, closeAll, setActiveTab, reorderTabs } = useTabs();
  const { toggleSidebar } = useSidebar();
  const now = useClock();
  const { can } = useAuth();

  const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const canCloseTab = tabs.length > 1;
  const hasOtherTabs = tabs.length > 1;

  const onAddTab = useCallback((navId) => addTab(navId), [addTab]);

  return (
    <div className="flex items-end gap-2 bg-ink-50 pt-2 pr-2">
      <button
        onClick={toggleSidebar}
        className="ml-2 mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 lg:hidden"
        aria-label="Buka menu navigasi"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-1 items-end overflow-x-auto scrollbar-slim">
        <Reorder.Group as="ol" axis="x" values={tabs} onReorder={reorderTabs} className="flex items-end" role="tablist">
          <AnimatePresence initial={false}>
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTabId;
              const hasRightNeighborActive = index < tabs.length - 1 && tabs[index + 1].id === activeTabId;
              return (
                <Reorder.Item
                  value={tab}
                  as="li"
                  layout
                  key={tab.id}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  whileDrag={{ cursor: 'grabbing' }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="group relative shrink-0"
                  style={{ zIndex: isActive ? 10 : 1 }}
                >
                  <ChromeTab
                    tab={tab}
                    isActive={isActive}
                    isLast={index === tabs.length - 1}
                    canClose={canCloseTab}
                    hasRightNeighborActive={hasRightNeighborActive}
                    onTabClick={() => setActiveTab(tab.id)}
                    onTabClose={() => closeTab(tab.id)}
                    onCloseOthers={() => closeOthers(tab.id)}
                    onCloseToRight={() => closeToRight(tab.id)}
                    onCloseToLeft={() => closeToLeft(tab.id)}
                    hasOtherTabs={hasOtherTabs}
                    hasTabsToRight={index < tabs.length - 1}
                    hasTabsToLeft={index > 0}
                  />
                </Reorder.Item>
              );
            })}
          </AnimatePresence>
        </Reorder.Group>

        <motion.div layout className="shrink-0">
          <NewTabButton onAddTab={onAddTab} />
        </motion.div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700" aria-label="Menu tab">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onAddTab()}>
            <Plus className="mr-2 h-4 w-4" />Tab Baru
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={closeAll} disabled={!hasOtherTabs} variant={hasOtherTabs ? 'danger' : 'default'}>
            <Trash2 className="mr-2 h-4 w-4" />Tutup Semua Tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mb-0.5 hidden items-center gap-2 pl-1 md:flex">
        <div className="hidden flex-col items-end leading-tight select-none lg:flex">
          <span className="text-[13px] font-semibold text-ink-700 tabular-nums">{timeLabel}</span>
          <span className="text-[11px] text-ink-400">{dateLabel}</span>
        </div>
        <div className="hidden h-6 w-px bg-ink-200 lg:block" />
        {(can('assets', 'view') || can('consumables', 'view') || can('requests', 'view')) && <AttentionCenter />}
        <NotificationHistoryDropdown />
      </div>
    </div>
  );
}
