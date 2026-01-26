'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Trade {
  id: string;
  timestamp: Date;
  outcome: 'YES' | 'NO';
  amount: number;
  price: number;
}

interface TradeHistoryProps {
  trades?: Trade[];
  className?: string;
}

// Generate mock trade data
function generateMockTrades(count: number = 15): Trade[] {
  const trades: Trade[] = [];
  const outcomes: ('YES' | 'NO')[] = ['YES', 'NO'];

  for (let i = 0; i < count; i++) {
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const amount = Math.random() * 100 + 10; // 10-110 tokens
    const price = Math.random() * 40 + 30; // 30-70 cents

    trades.push({
      id: `trade-${i}`,
      timestamp: new Date(Date.now() - i * 60000 * Math.random() * 30), // Random time in last 30 mins
      outcome,
      amount: Math.floor(amount * 100) / 100,
      price: Math.floor(price * 100) / 100,
    });
  }

  return trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Format timestamp for display
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}

export default function TradeHistory({ trades, className }: TradeHistoryProps) {
  const [historyTrades, setHistoryTrades] = useState<Trade[]>(trades || generateMockTrades());

  // Update trades periodically to simulate real-time activity
  useEffect(() => {
    if (!trades) {
      const interval = setInterval(() => {
        const outcomes: ('YES' | 'NO')[] = ['YES', 'NO'];
        const newTrade: Trade = {
          id: `trade-${Date.now()}`,
          timestamp: new Date(),
          outcome: outcomes[Math.floor(Math.random() * outcomes.length)],
          amount: Math.floor((Math.random() * 100 + 10) * 100) / 100,
          price: Math.floor((Math.random() * 40 + 30) * 100) / 100,
        };

        setHistoryTrades((prev) => [newTrade, ...prev].slice(0, 20));
      }, 5000); // Add new trade every 5 seconds

      return () => clearInterval(interval);
    }
  }, [trades]);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-secondary">Recent Trades</h3>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yes rounded-full animate-pulse"></span>
          <span className="text-xs text-text-muted">Live</span>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-dark-hover rounded-t-lg">
        <span className="text-xs text-text-muted font-medium">Time</span>
        <span className="text-xs text-text-muted font-medium text-center">Outcome</span>
        <span className="text-xs text-text-muted font-medium text-right">Amount</span>
        <span className="text-xs text-text-muted font-medium text-right">Price</span>
      </div>

      {/* Trade list */}
      <div className="max-h-64 overflow-y-auto">
        {historyTrades.map((trade) => (
          <div
            key={trade.id}
            className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-dark-border hover:bg-dark-hover/50 transition-colors font-mono text-sm"
          >
            {/* Time */}
            <span className="text-text-muted text-xs flex items-center">
              {formatTimestamp(trade.timestamp)}
            </span>

            {/* Outcome */}
            <div className="flex items-center justify-center">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-bold',
                  trade.outcome === 'YES'
                    ? 'bg-yes/10 text-yes'
                    : 'bg-no/10 text-no'
                )}
              >
                {trade.outcome}
              </span>
            </div>

            {/* Amount */}
            <span className="text-text-secondary text-right">{trade.amount.toFixed(2)}</span>

            {/* Price */}
            <span className="text-text-secondary text-right">{trade.price.toFixed(2)}¢</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-2 text-center">
        <button className="text-xs text-brand-primary hover:text-brand-primary/80 transition-colors">
          View all trades
        </button>
      </div>
    </div>
  );
}
