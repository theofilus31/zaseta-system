import React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Port dari komponen DropdownMenu shadcn/ui ke JSX, token warna Zaseta.
 * Animasi masuk pakai `animate-scale-in` yang sudah ada di tailwind.config.js
 * (dipakai komponen lain juga) — bukan plugin tailwindcss-animate (fade-in-0/
 * zoom-in-95/slide-in-from-*) yang tidak terpasang di proyek ini.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuSubTrigger({ className, inset, children, ...props }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(
        'flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none',
        'focus:bg-ink-100 data-[state=open]:bg-ink-100',
        inset && 'pl-8',
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }) {
  return (
    <DropdownMenuPrimitive.SubContent
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-xl border border-ink-200/70 bg-white p-1 text-ink-800 shadow-overlay',
        'data-[state=open]:animate-scale-in',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-xl border border-ink-200/70 bg-white p-1 text-ink-800 shadow-overlay',
          'data-[state=open]:animate-scale-in',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/* `variant` — bukan className bebas — untuk warna item yang punya makna
   status (mis. aksi hapus/tutup-semua). cn() proyek ini cuma menggabung
   kelas, tidak menyelesaikan konflik seperti tailwind-merge: kalau warna
   fokus/teks dilempar lewat className caller, dia akan numpuk berdampingan
   dengan focus:text-ink-900 bawaan di bawah, bukan menimpanya — persis bug
   yang sempat lolos di tombol "Tutup Semua Tab" (TabBar.jsx). */
export function DropdownMenuItem({ className, inset, variant = 'default', ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors',
        variant === 'danger'
          ? 'text-danger-600 focus:bg-danger-50 focus:text-danger-700'
          : 'focus:bg-ink-100 focus:text-ink-900',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'focus:bg-ink-100 focus:text-ink-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors',
        'focus:bg-ink-100 focus:text-ink-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, inset, ...props }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-sm font-semibold text-ink-800', inset && 'pl-8', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-ink-100', className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }) {
  return <span className={cn('ml-auto text-xs tracking-widest text-ink-400', className)} {...props} />;
}
