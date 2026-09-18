import React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/** Port dari komponen ContextMenu shadcn/ui ke JSX, token warna Zaseta. */

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

export function ContextMenuSubTrigger({ className, inset, children, ...props }) {
  return (
    <ContextMenuPrimitive.SubTrigger
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
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({ className, ...props }) {
  return (
    <ContextMenuPrimitive.SubContent
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-xl border border-ink-200/70 bg-white p-1 text-ink-800 shadow-overlay',
        'data-[state=open]:animate-scale-in',
        className
      )}
      {...props}
    />
  );
}

export function ContextMenuContent({ className, ...props }) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-xl border border-ink-200/70 bg-white p-1 text-ink-800 shadow-overlay',
          'data-[state=open]:animate-scale-in',
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

/* `variant` — sama seperti DropdownMenuItem (lihat catatan di sana) —
   supaya item berwarna status (mis. aksi hapus) tidak butuh caller melempar
   className yang bisa tabrakan dengan focus:text-ink-900 bawaan. */
export function ContextMenuItem({ className, inset, variant = 'default', ...props }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none',
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

export function ContextMenuCheckboxItem({ className, children, checked, ...props }) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none',
        'focus:bg-ink-100 focus:text-ink-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ContextMenuRadioItem({ className, children, ...props }) {
  return (
    <ContextMenuPrimitive.RadioItem
      className={cn(
        'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none',
        'focus:bg-ink-100 focus:text-ink-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

export function ContextMenuLabel({ className, inset, ...props }) {
  return (
    <ContextMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-sm font-semibold text-ink-800', inset && 'pl-8', className)}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className, ...props }) {
  return <ContextMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-ink-100', className)} {...props} />;
}

export function ContextMenuShortcut({ className, ...props }) {
  return <span className={cn('ml-auto text-xs tracking-widest text-ink-400', className)} {...props} />;
}
