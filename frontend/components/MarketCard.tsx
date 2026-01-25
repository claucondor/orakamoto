'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatTokenAmount, formatAddress, timeUntilBlock } from '@/lib/constants';
import { getMarketPrices } from '@/lib/contracts';
import type { Market } from '@/lib/contracts';
import { useMarketsStore } from '@/lib/store';
import { Clock, Users, TrendingUp, CheckCircle, XCircle } from 'lucide-react';

interface MarketCardProps {
  market: Market;
}

export default function MarketCard({ market }: MarketCardProps) {
  const { currentBlockHeight } = useMarketsStore();
  const [prices, setPrices] = useState<{ yesPrice: number; noPrice: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrices() {
      const marketPrices = await getMarketPrices(market.marketId);
      if (marketPrices) {
        setPrices({
          yesPrice: marketPrices.yesPrice,
          noPrice: marketPrices.noPrice,
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

  return (
    <Link href={`/markets/${market.marketId}`}>
      <div className="card hover:border-brand-primary/50 transition-all duration-200 cursor-pointer group">
        {/* Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isResolved ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-brand-secondary/10 text-brand-secondary text-xs font-medium rounded-full">
                <CheckCircle className="w-3 h-3" />
                Resolved
              </span>
            ) : isActive ? (
              <span className="flex items-center gap-1 px-2 py-1 bg-yes/10 text-yes text-xs font-medium rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-yes animate-pulse"></span>
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-warning/10 text-warning text-xs font-medium rounded-full">
                <Clock className="w-3 h-3" />
                Ended
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted">#{market.marketId}</span>
        </div>

        {/* Question */}
        <h3 className="text-lg font-semibold text-white mb-4 group-hover:text-brand-primary transition-colors line-clamp-2">
          {market.question}
        </h3>

        {/* Price Bars */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-yes font-medium">YES {yesPercent}%</span>
            <span className="text-no font-medium">NO {noPercent}%</span>
          </div>
          <div className="h-2 bg-dark-hover rounded-full overflow-hidden flex">
            {loading ? (
              <div className="w-full skeleton"></div>
            ) : (
              <>
                <div
                  className="bg-yes transition-all duration-500"
                  style={{ width: `${yesPercent}%` }}
                ></div>
                <div
                  className="bg-no transition-all duration-500"
                  style={{ width: `${noPercent}%` }}
                ></div>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              ${formatTokenAmount(market.totalLiquidity)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {formatAddress(market.creator)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {timeRemaining}
          </div>
        </div>

        {/* Resolved Outcome */}
        {isResolved && market.winningOutcome !== null && (
          <div className="mt-4 pt-4 border-t border-dark-border">
            <div className={`flex items-center justify-center gap-2 py-2 rounded-lg ${
              market.winningOutcome === 0 ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no'
            }`}>
              {market.winningOutcome === 0 ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Resolved YES</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium">Resolved NO</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
