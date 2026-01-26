'use client';

import { Search, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MarketSearchProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export default function MarketSearch({
  onSearch,
  placeholder = '&gt; Search markets...',
  className,
}: MarketSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Call onSearch when debounced query changes
  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSearch(query);
    },
    [query, onSearch]
  );

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <div className="relative">
        {/* Search Icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-matrix-green pointer-events-none">
          <Search className="w-5 h-5" />
        </div>

        {/* Terminal-style Input */}
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            'w-full pl-12 pr-12 py-3 font-mono',
            'bg-void-black border-2 border-dark-border',
            'text-matrix-green placeholder-text-muted',
            'focus:outline-none focus:border-matrix-green focus:shadow-[0_0_10px_rgba(0,255,65,0.3)]',
            'transition-all duration-200',
            'hover:border-matrix-green/50'
          )}
        />

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'absolute right-4 top-1/2 -translate-y-1/2',
              'text-cyber-magenta hover:text-white',
              'transition-colors duration-200',
              'p-1 hover:scale-110',
              'active:scale-95'
            )}
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </form>
  );
}
