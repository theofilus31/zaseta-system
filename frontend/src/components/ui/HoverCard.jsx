import React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '../../utils/cn.js';

/** Port dari komponen HoverCard shadcn/ui ke JSX, token warna Zaseta. */

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export function HoverCardContent({ className, align = 'center', sideOffset = 4, ...props }) {
  return (
    <HoverCardPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-64 rounded-xl border border-ink-200/70 bg-white p-4 text-ink-800 shadow-overlay outline-none',
        'data-[state=open]:animate-scale-in',
        className
      )}
      {...props}
    />
  );
}
