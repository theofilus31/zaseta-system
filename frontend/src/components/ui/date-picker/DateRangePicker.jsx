import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from './button.jsx';
import { Calendar } from './calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.jsx';

/**
 * Pemilih rentang tanggal (dari–sampai) dengan dropdown bulan/tahun di atas
 * kalender — dipakai untuk filter yang benar-benar butuh DUA tanggal
 * sekaligus (bukan pengganti field tanggal tunggal, itu ada di DatePicker.jsx).
 */
export function DateRangePicker({ value, onChange, className = '', placeholder = 'Pilih rentang tanggal' }) {
  const today = new Date();
  const [internal, setInternal] = useState(undefined);
  const selected = value !== undefined ? value : internal;
  const setSelected = onChange || setInternal;

  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const displayMonth = new Date(year, month, 1);

  const formattedValue = selected?.from
    ? selected.to
      ? `${format(selected.from, 'PPP', { locale: idLocale })} - ${format(selected.to, 'PPP', { locale: idLocale })}`
      : format(selected.from, 'PPP', { locale: idLocale })
    : placeholder;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`w-full justify-start text-left font-normal ${className}`}>
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate overflow-hidden">{formattedValue}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={year.toString()} onValueChange={(val) => setYear(Number(val))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Tahun" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 40 }, (_, i) => year - 20 + i).map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={month.toString()} onValueChange={(val) => setMonth(Number(val))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Bulan" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {format(new Date(2000, i, 1), 'MMMM', { locale: idLocale })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Calendar
            mode="range"
            selected={selected}
            onSelect={setSelected}
            month={displayMonth}
            onMonthChange={(date) => {
              setMonth(date.getMonth());
              setYear(date.getFullYear());
            }}
            className="rounded-md border border-ink-200"
          />

          <div className="flex justify-between pt-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(undefined)} disabled={!selected}>
              Bersihkan
            </Button>
            <Button size="sm" disabled={!selected}>
              Terapkan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
