/**
 * MobileSelect — renders a native bottom-sheet Drawer on mobile,
 * and a regular shadcn Select on desktop.
 * Props mirror a simplified Select: value, onValueChange, placeholder, options[]
 * options: [{ value: string, label: string }]
 */
import React, { useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from '@/components/ui/drawer';
import { Check } from 'lucide-react';

function useIsMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

export default function MobileSelect({
  value,
  onValueChange,
  placeholder = 'Sélectionner',
  options = [],
  triggerClassName = '',
  label,
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <>
      {/* Trigger button — 44px min-height for iOS touch targets */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-md border border-input bg-card text-sm text-foreground ${triggerClassName}`}
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{selectedLabel}</span>
        <svg className="w-4 h-4 text-muted-foreground opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">{label || placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col pb-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onValueChange(o.value); setOpen(false); }}
                className="flex items-center justify-between min-h-[52px] px-6 text-sm font-medium text-foreground hover:bg-secondary/50 active:bg-secondary transition-colors"
              >
                <span>{o.label}</span>
                {value === o.value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}