'use client';

import { LineChart, Line, ResponsiveContainer, Area, AreaChart, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  data: number[];
  color?: string;
  className?: string;
}

// Generate mock price data with random walk
function generateMockData(length: number = 20): number[] {
  const data: number[] = [];
  let price = 50 + Math.random() * 10; // Start around 50

  for (let i = 0; i < length; i++) {
    price += (Math.random() - 0.5) * 5; // Random walk
    price = Math.max(10, Math.min(90, price)); // Keep between 10 and 90
    data.push(price);
  }

  return data;
}

export default function PriceChart({ data, color = '#F7931A', className }: PriceChartProps) {
  // Use provided data or generate mock data
  const chartData = data && data.length > 0 ? data : generateMockData(20);

  // Convert to format expected by recharts
  const formattedData = chartData.map((price, index) => ({
    index,
    price,
  }));

  const lastPrice = chartData[chartData.length - 1];
  const firstPrice = chartData[0];
  const isPositive = lastPrice >= firstPrice;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative" style={{ height: '60px', width: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${color.replace('#', '')})`}
              animationDuration={500}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-dark-card border border-dark-border rounded-lg px-2 py-1 text-xs">
                      {payload[0].value?.toFixed(1)}%
                    </div>
                  );
                }
                return null;
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Last price indicator */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-text-muted">Current</span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold" style={{ color }}>
            {lastPrice.toFixed(1)}%
          </span>
          {isPositive ? (
            <svg
              className="w-3 h-3 text-yes"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-3 h-3 text-no"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
