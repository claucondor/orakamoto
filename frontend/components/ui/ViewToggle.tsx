'use client';

import { Grid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewType = 'grid' | 'list';

interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  className?: string;
}

export default function ViewToggle({ currentView, onViewChange, className }: ViewToggleProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 bg-dark-card border border-dark-border rounded-lg',
        className
      )}
    >
      <button
        onClick={() => onViewChange('grid')}
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200',
          'hover:scale-105 active:scale-95',
          currentView === 'grid'
            ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
            : 'text-text-secondary hover:text-white hover:bg-dark-hover'
        )}
        aria-label="Grid view"
      >
        <Grid className="w-4 h-4" />
        <span className="hidden sm:inline">Grid</span>
      </button>
      <button
        onClick={() => onViewChange('list')}
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200',
          'hover:scale-105 active:scale-95',
          currentView === 'list'
            ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20'
            : 'text-text-secondary hover:text-white hover:bg-dark-hover'
        )}
        aria-label="List view"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}
