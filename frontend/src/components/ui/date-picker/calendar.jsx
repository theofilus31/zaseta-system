import { id as idLocale } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React from 'react';
import { DayPicker } from 'react-day-picker';

import { cn } from '../../../utils/cn.js';
import { buttonVariants } from './button.jsx';

export function Calendar({ className, classNames, showOutsideDays = true, components: userComponents, locale = idLocale, ...props }) {
  const defaultClassNames = {
    months: 'relative flex flex-col sm:flex-row gap-4',
    month: 'w-full',
    month_caption: 'relative mx-10 mb-1 flex h-9 items-center justify-center z-20',
    caption_label: 'text-sm font-medium text-ink-800',
    nav: 'absolute top-0 flex w-full justify-between z-10',
    button_previous: cn(buttonVariants({ variant: 'ghost' }), 'size-9 text-ink-400 hover:text-ink-800 p-0'),
    button_next: cn(buttonVariants({ variant: 'ghost' }), 'size-9 text-ink-400 hover:text-ink-800 p-0'),
    weekday: 'size-9 p-0 text-xs font-medium text-ink-400',
    day_button:
      'relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-ink-800 outline-offset-2 transition-colors focus:outline-none group-data-[disabled]:pointer-events-none focus-visible:z-10 hover:bg-ink-100 group-data-[selected]:bg-brand-700 group-data-[selected]:text-white group-data-[disabled]:text-ink-300 group-data-[disabled]:line-through group-data-[outside]:text-ink-300 group-data-[outside]:group-data-[selected]:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500/70 group-[.range-start:not(.range-end)]:rounded-e-none group-[.range-end:not(.range-start)]:rounded-s-none group-[.range-middle]:rounded-none group-data-[selected]:group-[.range-middle]:bg-brand-50 group-data-[selected]:group-[.range-middle]:text-ink-800',
    day: 'group size-9 px-0 text-sm',
    range_start: 'range-start',
    range_end: 'range-end',
    range_middle: 'range-middle',
    today:
      "*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-brand-500 [&[data-selected]:not(.range-middle)>*]:after:bg-white [&[data-disabled]>*]:after:bg-ink-300 *:after:transition-colors",
    outside: 'text-ink-300 data-selected:bg-brand-50/50 data-selected:text-ink-400',
    hidden: 'invisible',
    week_number: 'size-9 p-0 text-xs font-medium text-ink-400',
  };

  const mergedClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key] ? cn(defaultClassNames[key], classNames[key]) : defaultClassNames[key],
    }),
    {}
  );

  const defaultComponents = {
    Chevron: (chevronProps) => {
      if (chevronProps.orientation === 'left') {
        return <ChevronLeft size={16} strokeWidth={2} {...chevronProps} aria-hidden="true" />;
      }
      return <ChevronRight size={16} strokeWidth={2} {...chevronProps} aria-hidden="true" />;
    },
  };

  const mergedComponents = { ...defaultComponents, ...userComponents };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn('w-fit', className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  );
}
Calendar.displayName = 'DatePickerCalendar';
