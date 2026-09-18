import { format, isValid, parse } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import React, { useState } from 'react';

import { FormField } from '../FormField.jsx';
import { Button } from './button.jsx';
import { Calendar } from './calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.jsx';

const ISO_FORMAT = 'yyyy-MM-dd';

function parseISO(value) {
  if (!value) return undefined;
  const d = parse(value, ISO_FORMAT, new Date());
  return isValid(d) ? d : undefined;
}

/**
 * Pengganti drop-in untuk DateField lama di Form.jsx — kontrak propnya
 * sengaja dibuat identik (`value` string 'YYYY-MM-DD', `onChange` menerima
 * objek mirip event) supaya seluruh pemakai lama tidak perlu diubah sama
 * sekali. Bedanya cuma "mesin" di baliknya: sekarang react-day-picker +
 * dropdown bulan/tahun ala shadcn, bukan kalender kustom manual.
 */
export function DatePicker({
  label, required, hint, error, className, inputClassName = '',
  value, onChange, name, id, placeholder = 'Pilih tanggal', disabled = false,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseISO(value);
  const today = new Date();
  const [viewDate, setViewDate] = useState(selectedDate || today);

  function emit(date) {
    onChange?.({ target: { name, value: date ? format(date, ISO_FORMAT) : '' } });
  }

  function handleOpenChange(next) {
    if (disabled) return;
    if (next) setViewDate(selectedDate || today);
    setOpen(next);
  }

  function pickDay(date) {
    emit(date);
    setOpen(false);
  }

  function goToday() {
    setViewDate(today);
    emit(today);
    setOpen(false);
  }

  function clearDate(e) {
    e.stopPropagation();
    emit(undefined);
    setOpen(false);
  }

  return (
    <FormField label={label} htmlFor={id} required={required} hint={hint} error={error} className={className}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <div className="relative">
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              disabled={disabled}
              className={[
                'field pl-10 text-left', selectedDate && !required ? 'pr-9' : '', error ? 'field-error' : '', inputClassName,
              ].join(' ')}
              {...rest}
            >
              <i className="fas fa-calendar-days absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-[13px] pointer-events-none" aria-hidden="true" />
              <span className={selectedDate ? 'text-ink-800' : 'text-ink-400'}>
                {selectedDate ? format(selectedDate, 'PPP', { locale: idLocale }) : placeholder}
              </span>
            </button>
          </PopoverTrigger>
          {selectedDate && !required && !disabled && (
            <button
              type="button"
              onClick={clearDate}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="Bersihkan tanggal"
            >
              <i className="fas fa-xmark text-xs" aria-hidden="true" />
            </button>
          )}
        </div>

        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select
                value={viewDate.getFullYear().toString()}
                onValueChange={(val) => setViewDate((d) => new Date(Number(val), d.getMonth(), 1))}
              >
                <SelectTrigger className="w-[104px]">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 80 }, (_, i) => today.getFullYear() - 70 + i).map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={viewDate.getMonth().toString()}
                onValueChange={(val) => setViewDate((d) => new Date(d.getFullYear(), Number(val), 1))}
              >
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
              mode="single"
              selected={selectedDate}
              onSelect={pickDay}
              month={viewDate}
              onMonthChange={setViewDate}
            />

            <div className="flex items-center justify-between pt-2 border-t border-ink-100">
              {!required ? (
                <Button size="sm" variant="ghost" onClick={() => { emit(undefined); setOpen(false); }}>
                  Bersihkan
                </Button>
              ) : <span />}
              <Button size="sm" variant="ghost" onClick={goToday}>
                Hari ini
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </FormField>
  );
}
