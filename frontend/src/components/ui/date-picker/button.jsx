import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import React from 'react';

import { cn } from '../../../utils/cn.js';

/**
 * Tombol khusus subsistem date-picker (Radix). SENGAJA terpisah dari
 * Button.jsx utama aplikasi — nama variant & warnanya beda kontrak
 * (default/outline/ghost ala shadcn vs primary/secondary/subtle di sana),
 * disatukan cuma akan bikin dua sistem tombol saling tabrakan.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500/70 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
        destructive: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700',
        outline: 'border border-ink-200 bg-white shadow-sm hover:bg-ink-50 hover:border-ink-300 text-ink-700',
        secondary: 'bg-ink-100 text-ink-700 hover:bg-ink-200/80',
        ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-800',
        link: 'text-brand-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 rounded-lg px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'DatePickerButton';
