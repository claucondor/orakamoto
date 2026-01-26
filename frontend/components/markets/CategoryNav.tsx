'use client';

import { Grid, Building2, Trophy, Bitcoin, Cpu, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Category {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const categories: Category[] = [
  { id: 'all', label: 'All', icon: Grid, color: '#A0A0A8' },
  { id: 'politics', label: 'Politics', icon: Building2, color: '#3B82F6' },
  { id: 'sports', label: 'Sports', icon: Trophy, color: '#F59E0B' },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin, color: '#F7931A' },
  { id: 'tech', label: 'Tech', icon: Cpu, color: '#8B5CF6' },
  { id: 'ai', label: 'AI', icon: Brain, color: '#EC4899' },
];

interface CategoryNavProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function CategoryNav({ selectedCategory, onCategoryChange }: CategoryNavProps) {
  return (
    <nav className="w-full">
      {/* Mobile: Horizontal scrollable pills */}
      <div className="lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all duration-200 whitespace-nowrap',
                  'hover:scale-105 active:scale-95',
                  isSelected
                    ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-lg shadow-brand-primary/20'
                    : 'bg-dark-card border border-dark-border text-text-secondary hover:border-brand-primary/50 hover:text-white'
                )}
                style={
                  !isSelected
                    ? { borderColor: isSelected ? undefined : category.color + '30' }
                    : undefined
                }
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{category.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: Tab bar style */}
      <div className="hidden lg:block">
        <div className="flex gap-1 bg-dark-card border border-dark-border rounded-xl p-1">
          {categories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 relative',
                  'hover:scale-105 active:scale-95',
                  isSelected
                    ? 'text-white'
                    : 'text-text-secondary hover:text-white'
                )}
              >
                <span style={isSelected ? { color: category.color } : undefined}>
                  <Icon className="w-5 h-5" />
                </span>
                <span>{category.label}</span>
                {isSelected && (
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full animate-scale-up"
                    style={{
                      background: `linear-gradient(to right, ${category.color}, ${category.color}80)`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
