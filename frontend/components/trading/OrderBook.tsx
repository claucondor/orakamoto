'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface OrderLevel {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  className?: string;
}

// Generate mock order book data
function generateMockOrders(): {
  yesOrders: OrderLevel[];
  noOrders: OrderLevel[];
} {
  const yesOrders: OrderLevel[] = [];
  const noOrders: OrderLevel[] = [];

  // Generate YES orders (descending price)
  let yesPrice = 70;
  for (let i = 0; i < 8; i++) {
    const amount = Math.random() * 500 + 50;
    yesOrders.push({
      price: Math.max(yesPrice, 30),
      amount: Math.floor(amount * 100) / 100,
      total: Math.floor(amount * (yesPrice / 100) * 100) / 100,
    });
    yesPrice -= Math.random() * 3 + 1;
  }

  // Generate NO orders (descending price)
  let noPrice = 65;
  for (let i = 0; i < 8; i++) {
    const amount = Math.random() * 500 + 50;
    noOrders.push({
      price: Math.max(noPrice, 25),
      amount: Math.floor(amount * 100) / 100,
      total: Math.floor(amount * (noPrice / 100) * 100) / 100,
    });
    noPrice -= Math.random() * 3 + 1;
  }

  return { yesOrders, noOrders };
}

export default function OrderBook({ className }: OrderBookProps) {
  const [orders, setOrders] = useState(generateMockOrders());

  // Update orders periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setOrders(generateMockOrders());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const maxYesTotal = Math.max(...orders.yesOrders.map((o) => o.total));
  const maxNoTotal = Math.max(...orders.noOrders.map((o) => o.total));

  return (
    <div className={cn('w-full max-w-[300px]', className)}>
      <h3 className="text-sm font-semibold text-text-secondary mb-4">Order Book</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* YES Orders */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-yes rounded-full"></span>
            <span className="text-sm font-bold text-yes">YES Orders</span>
          </div>

          <div className="space-y-1">
            {orders.yesOrders.map((order, index) => {
              const widthPercent = (order.total / maxYesTotal) * 100;
              return (
                <div key={`yes-${index}`} className="relative">
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-yes/10 rounded"
                    style={{ width: `${widthPercent}%` }}
                  ></div>

                  {/* Content */}
                  <div className="relative flex items-center justify-between px-2 py-1 text-xs font-mono">
                    <span className="text-text-muted">{order.price.toFixed(1)}¢</span>
                    <span className="text-text-secondary">{order.amount.toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* NO Orders */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-no rounded-full"></span>
            <span className="text-sm font-bold text-no">NO Orders</span>
          </div>

          <div className="space-y-1">
            {orders.noOrders.map((order, index) => {
              const widthPercent = (order.total / maxNoTotal) * 100;
              return (
                <div key={`no-${index}`} className="relative">
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-no/10 rounded"
                    style={{ width: `${widthPercent}%` }}
                  ></div>

                  {/* Content */}
                  <div className="relative flex items-center justify-between px-2 py-1 text-xs font-mono">
                    <span className="text-text-muted">{order.price.toFixed(1)}¢</span>
                    <span className="text-text-secondary">{order.amount.toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Spread indicator */}
      <div className="mt-4 pt-3 border-t border-dark-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Spread</span>
          <span className="font-mono text-text-secondary">
            {(100 - orders.yesOrders[0]?.price - orders.noOrders[0]?.price).toFixed(1)}¢
          </span>
        </div>
      </div>
    </div>
  );
}
