'use client';

import { DollarSign, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  colorClass: string;
}

interface StatsTickerProps {
  tvl?: string;
  volume24h?: string;
  totalMarkets?: number;
  className?: string;
}

const defaultStats: StatItem[] = [
  {
    label: 'TVL',
    value: '$18,234 USDC',
    icon: DollarSign,
    color: '#F7931A',
    colorClass: 'text-btc-orange',
  },
  {
    label: '24H_VOLUME',
    value: '$5,432 USDC',
    icon: TrendingUp,
    color: '#00FF41',
    colorClass: 'text-matrix-green',
  },
  {
    label: 'MARKETS',
    value: '4_MARKETS',
    icon: BarChart3,
    color: '#00F7FF',
    colorClass: 'text-cyber-cyan',
  },
];

export default function StatsTicker({
  tvl,
  volume24h,
  totalMarkets,
  className,
}: StatsTickerProps) {
  const stats = defaultStats.map((stat) => {
    if (stat.label === 'TVL' && tvl) return { ...stat, value: tvl };
    if (stat.label === '24H_VOLUME' && volume24h) return { ...stat, value: volume24h };
    if (stat.label === 'MARKETS' && totalMarkets !== undefined) {
      return { ...stat, value: `${totalMarkets}_MARKET${totalMarkets !== 1 ? 'S' : ''}` };
    }
    return stat;
  });

  return (
    <div
      className={cn(
        'w-full bg-terminal-bg border-2 border-dark-border font-mono',
        'overflow-hidden relative',
        className
      )}
    >
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-matrix-green/5 to-transparent animate-scanline" />
      </div>

      <div className="relative flex items-center justify-around gap-4 py-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-3 px-4 py-2 border-2 border-dark-border/50 hover:border-matrix-green/50 transition-colors duration-200"
            >
              <div
                className="p-2 border-2 border-current"
                style={{ color: stat.color }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-matrix-dark font-bold uppercase tracking-wider">
                  {stat.label}
                </span>
                <span className={cn('text-sm font-bold', stat.colorClass)}>{stat.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
