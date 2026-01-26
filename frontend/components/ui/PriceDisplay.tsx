'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Trend = 'up' | 'down' | 'neutral';

interface PriceDisplayProps {
  value: number;
  trend?: Trend;
  change?: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: {
    value: 'text-lg font-bold',
    change: 'text-xs',
    icon: 'w-3 h-3',
  },
  md: {
    value: 'text-2xl font-bold',
    change: 'text-sm',
    icon: 'w-4 h-4',
  },
  lg: {
    value: 'text-3xl font-bold',
    change: 'text-base',
    icon: 'w-5 h-5',
  },
};

const trendConfig = {
  up: {
    color: 'text-matrix-green',
    borderColor: 'border-matrix-green',
    bgColor: 'bg-matrix-green/10',
    icon: TrendingUp,
    label: 'Up',
  },
  down: {
    color: 'text-cyber-magenta',
    borderColor: 'border-cyber-magenta',
    bgColor: 'bg-cyber-magenta/10',
    icon: TrendingDown,
    label: 'Down',
  },
  neutral: {
    color: 'text-text-secondary',
    borderColor: 'border-dark-border',
    bgColor: 'bg-dark-card',
    icon: Minus,
    label: 'Neutral',
  },
};

export default function PriceDisplay({
  value,
  trend = 'neutral',
  change,
  size = 'md',
  showIcon = true,
  className,
}: PriceDisplayProps) {
  const sizeClass = sizeClasses[size];
  const config = trendConfig[trend];
  const TrendIcon = config.icon;

  // Format change percentage
  const formattedChange = change !== undefined ? `${change > 0 ? '+' : ''}${change}%` : undefined;
  const changeColor = change !== undefined
    ? change > 0
      ? 'text-matrix-green'
      : change < 0
      ? 'text-cyber-magenta'
      : 'text-text-secondary'
    : undefined;

  return (
    <div
      className={cn(
        'flex items-baseline gap-2 font-mono',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        className
      )}
    >
      {/* Main value */}
      <div className={cn('flex items-center gap-2', sizeClass.value)}>
        {showIcon && (
          <div
            className={cn(
              'p-2 border-2 flex items-center justify-center',
              config.borderColor,
              config.bgColor
            )}
          >
            <TrendIcon className={cn(sizeClass.icon, config.color)} />
          </div>
        )}
        <span className={config.color}>{value}%</span>
      </div>

      {/* Optional change indicator */}
      {formattedChange && (
        <span className={cn(sizeClass.change, changeColor, 'font-medium')}>
          {formattedChange}
        </span>
      )}
    </div>
  );
}

// Convenience exports
export function YesPrice(props: Omit<PriceDisplayProps, 'trend'>) {
  return <PriceDisplay trend="up" {...props} />;
}

export function NoPrice(props: Omit<PriceDisplayProps, 'trend'>) {
  return <PriceDisplay trend="down" {...props} />;
}
