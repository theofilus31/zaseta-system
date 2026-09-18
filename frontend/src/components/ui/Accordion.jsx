import React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

/**
 * Port dari komponen Accordion shadcn/ui ke JSX — dibangun di atas
 * @radix-ui/react-accordion (sudah satu ekosistem dengan react-popover/
 * react-select/react-slot yang lebih dulu dipakai di proyek ini). Warna &
 * fokus-ring mengikuti token Zaseta sendiri, bukan token shadcn
 * (muted-foreground/accent/ring).
 */

export function Accordion(props) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({ className, ...props }) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={className} {...props} />;
}

export function AccordionTrigger({ className, chevronClassName = 'text-ink-400', children, ...props }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-center justify-between gap-3 py-3 text-left outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:pointer-events-none disabled:opacity-50',
          '[&[data-state=open]>svg]:rotate-180',
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className={cn('size-4 shrink-0 transition-transform duration-200', chevronClassName)} aria-hidden="true" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn('pb-1', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
