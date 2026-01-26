'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatTokenAmount, formatAddress, timeUntilBlock } from '@/lib/constants';
import { getMarketPrices } from '@/lib/contracts';
import type { Market } from '@/lib/contracts';
import { useMarketsStore } from '@/lib/store';
import { Clock, Users, TrendingUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Badge, { BadgeVariant } from '@/components/ui/Badge';
import PriceDisplay, { Trend } from '@/components/ui/PriceDisplay';

// Mock categories - in production this would come from market metadata
const mockCategories: Record<number, { id: string; label: string }> = {
  0: { id: 'crypto', label: 'Crypto' },
  1: { id: 'politics', label: 'Politics' },
  2: { id: 'sports', label: 'Sports' },
};

interface MarketCardProps {
  market: Market;
}

export default function MarketCard({ market }: MarketCardProps) {
  const { currentBlockHeight } = useMarketsStore();
  const [prices, setPrices] = useState<{ yesPrice: number; noPrice: number; yesTrend?: Trend; noTrend?: Trend } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    async function fetchPrices() {
      const marketPrices = await getMarketPrices(market.marketId);
      if (marketPrices) {
        setPrices({
          yesPrice: marketPrices.yesPrice,
          noPrice: marketPrices.noPrice,
          // Mock trend data - in production this would come from historical price data
          yesTrend: marketPrices.yesPrice > 500000 ? 'up' : marketPrices.yesPrice < 500000 ? 'down' : 'neutral',
          noTrend: marketPrices.noPrice > 500000 ? 'up' : marketPrices.noPrice < 500000 ? 'down' : 'neutral',
        });
      }
      setLoading(false);
    }
    fetchPrices();
  }, [market.marketId]);

  const isActive = !market.isResolved && currentBlockHeight < market.deadline;
  const isResolved = market.isResolved;
  const timeRemaining = timeUntilBlock(market.deadline, currentBlockHeight);

  // Calculate price percentages (prices are in 6 decimals, 1000000 = 100%)
  const yesPercent = prices ? (prices.yesPrice / 10000).toFixed(1) : '50.0';
  const noPercent = prices ? (prices.noPrice / 10000).toFixed(1) : '50.0';

  // Calculate blocks remaining for urgency
  const blocksRemaining = market.deadline - currentBlockHeight;
  const isUrgent = blocksRemaining > 0 && blocksRemaining < 100; // Less than 100 blocks = urgent

  // Get category
  const category = mockCategories[market.marketId % 3] || { id: 'crypto', label: 'Crypto' };

  // Calculate liquidity percentage (target is 100 USDC = 100000000 microUSDC)
  const liquidityTarget = 100000000n;
  const liquidityPercent = Math.min(Number((market.totalLiquidity * 100n) / liquidityTarget), 100);

  // Determine badge variant
  const getBadgeVariant = (): BadgeVariant => {
    if (isResolved) return 'resolved';
    if (isActive) return 'active';
    return 'ended';
  };

  return (
    <Link href={`/markets/${market.marketId}`}>
      <div
        className="brutalist-card card-spacing group relative overflow-hidden cursor-pointer noise-texture"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Scanline effect on hover */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyber-cyan/5 to-transparent pointer-events-none animate-scanline"></div>
        )}

        {/* Category Badge & Status */}
        <div className="flex items-center justify-between mb-6">
          <Badge variant={getBadgeVariant()} size="sm" />
          <span className="text-sm text-text-secondary font-mono">#{market.marketId}</span>
        </div>

        {/* Category Label */}
        <div className="mb-4">
          <span className="terminal-badge terminal-badge-cyan text-sm">
            {category.label.toUpperCase()}
          </span>
        </div>

        {/* Question */}
        <h3 className="text-xl font-bold text-text-bright mb-6 group-hover:text-cyber-cyan transition-colors line-clamp-2 font-mono leading-relaxed">
          &gt; {market.question}
        </h3>

        {/* Price Display with Trend */}
        <div className="mb-6 flex items-center gap-6">
          <PriceDisplay
            value={parseFloat(yesPercent)}
            trend={prices?.yesTrend}
            size="sm"
            showIcon={false}
            className="flex-1"
          />
          <PriceDisplay
            value={parseFloat(noPercent)}
            trend={prices?.noTrend}
            size="sm"
            showIcon={false}
            className="flex-1"
          />
        </div>

        {/* Price Bars - Brutalist Style */}
        <div className="mb-6">
          <div className="h-2 bg-dark-border overflow-hidden flex">
            {loading ? (
              <div className="w-full skeleton"></div>
            ) : (
              <>
                <div
                  className="bg-matrix-green transition-all duration-500"
                  style={{ width: `${yesPercent}%` }}
                ></div>
                <div
                  className="bg-cyber-magenta transition-all duration-500"
                  style={{ width: `${noPercent}%` }}
                ></div>
              </>
            )}
          </div>
          {/* Terminal-style stats below bar */}
          <div className="flex justify-between mt-3 text-sm font-mono">
            <span className="text-matrix-green font-semibold">YES: {yesPercent}%</span>
            <span className="text-cyber-magenta font-semibold">NO: {noPercent}%</span>
          </div>
        </div>

        {/* Liquidity Progress Bar - Terminal Style */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-text-secondary mb-2 font-mono">
            <span className="text-matrix-dark">&gt; LIQUIDITY</span>
            <span className="text-cyber-cyan font-semibold">${formatTokenAmount(market.totalLiquidity)} / 100 USDC</span>
          </div>
          <div className="h-1.5 bg-dark-border overflow-hidden">
            <div
              className="h-full bg-btc-orange transition-all duration-500"
              style={{ width: `${liquidityPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Stats with Time Urgency - Terminal Format */}
        <div className="flex items-center justify-between text-base text-text-secondary font-mono border-t-2 border-dark-border pt-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4 text-cyber-cyan" />
              <span className="text-matrix-dark">VOL:</span> ${formatTokenAmount(market.totalLiquidity)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4 text-cyber-yellow" />
              {formatAddress(market.creator)}
            </span>
          </div>
          <div
            className={`flex items-center gap-1 text-xs ${
              isUrgent ? 'text-cyber-yellow font-bold' : ''
            }`}
          >
            {isUrgent ? (
              <AlertCircle className="w-4 h-4 animate-pulse" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            {timeRemaining}
          </div>
        </div>

        {/* Quick Trade Buttons on Hover */}
        <div
          className={`absolute inset-0 bg-void-black/95 backdrop-blur-sm flex items-center justify-center gap-6 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            className={`trade-button-yes ${
              isResolved ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isResolved}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Handle buy yes
            }}
          >
            BUY YES
          </button>
          <button
            className={`trade-button-no ${
              isResolved ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isResolved}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Handle buy no
            }}
          >
            BUY NO
          </button>
        </div>

        {/* Resolved Outcome */}
        {isResolved && market.winningOutcome !== null && (
          <div className="mt-4 pt-4 border-t-2 border-dark-border">
            <div
              className={`flex items-center justify-center gap-2 py-2 ${
                market.winningOutcome === 0 ? 'bg-matrix-green/10 border-2 border-matrix-green text-matrix-green' : 'bg-cyber-magenta/10 border-2 border-cyber-magenta text-cyber-magenta'
              }`}
            >
              {market.winningOutcome === 0 ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium font-mono">RESOLVED_YES</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium font-mono">RESOLVED_NO</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
