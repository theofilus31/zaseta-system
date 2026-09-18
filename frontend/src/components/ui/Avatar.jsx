import React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../../utils/cn.js';

/**
 * Port dari komponen Avatar shadcn/ui ke JSX. Warna latar/teks SENGAJA tidak
 * dipatok di sini (beda dari kebiasaan primitif lain di berkas ini) — dulu
 * badge inisial di kaki Sidebar punya gradien `from-info-500 to-brand-500`
 * yang khas, dan mematok warna default di sini akan tabrakan dengan className
 * pemanggil (cn() proyek ini cuma menggabung kelas, tidak menyelesaikan
 * konflik seperti tailwind-merge).
 */

export const Avatar = React.forwardRef(function Avatar({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
});

export const AvatarImage = React.forwardRef(function AvatarImage({ className, ...props }, ref) {
  return <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full object-cover', className)} {...props} />;
});

export const AvatarFallback = React.forwardRef(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn('flex h-full w-full items-center justify-center rounded-full', className)}
      {...props}
    />
  );
});
