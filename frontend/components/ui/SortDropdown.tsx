'use client';

import { ChevronDown, ArrowUpDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export type SortOption = 'volume' | 'liquidity' | 'ending-soon' | 'newest';

interface SortOptionConfig {
  value: SortOption;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const sortOptions: SortOptionConfig[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'ending-soon', label: 'Ending Soon' },
  { value: 'newest', label: 'Newest' },
];

interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  className?: string;
}

export default function SortDropdown({ value, onChange, className }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = sortOptions.find((opt) => opt.value === value) || sortOptions[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: SortOption) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border rounded-lg',
          'text-sm font-medium text-white',
          'hover:bg-dark-hover hover:border-brand-primary/50',
          'transition-all duration-200',
          'hover:scale-105 active:scale-95',
          'focus:outline-none focus:ring-2 focus:ring-brand-primary/20',
          isOpen && 'ring-2 ring-brand-primary/20'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Sort by"
      >
        <ArrowUpDown className="w-4 h-4 text-text-muted" />
        <span>Sort by {selectedOption.label}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-muted transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-48 bg-dark-card border border-dark-border rounded-lg shadow-xl z-50',
            'animate-fade-in'
          )}
          role="listbox"
          aria-label="Sort options"
        >
          <div className="py-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium transition-colors',
                  'hover:bg-dark-hover',
                  value === option.value
                    ? 'text-brand-primary bg-brand-primary/5'
                    : 'text-text-secondary hover:text-white'
                )}
                role="option"
                aria-selected={value === option.value}
              >
                {option.icon && <option.icon className="w-4 h-4" />}
                <span>{option.label}</span>
                {value === option.value && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
