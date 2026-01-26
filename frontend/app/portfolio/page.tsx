'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWalletStore, useMarketsStore } from '@/lib/store';
import { getUserPosition, getMarketPrices } from '@/lib/contracts';
import { formatTokenAmount, formatAddress } from '@/lib/constants';
import type { Market, UserPosition } from '@/lib/contracts';
import {
  Wallet,
  TrendingUp,
  Droplets,
  Trophy,
  ArrowRight,
  ExternalLink,
  Coins,
} from 'lucide-react';
import { TableSkeleton } from '@/components/feedback/LoadingSkeleton';

interface PositionWithMarket {
  market: Market;
  position: UserPosition;
  prices: { yesPrice: number; noPrice: number } | null;
}

export default function PortfolioPage() {
  const [mounted, setMounted] = useState(false);
  const [positions, setPositions] = useState<PositionWithMarket[]>([]);
  const [loading, setLoading] = useState(true);

  const { address, isConnected, usdcxBalance, refreshBalance } = useWalletStore();
  const { markets, fetchMarkets, currentBlockHeight, fetchBlockHeight } = useMarketsStore();

  useEffect(() => {
    setMounted(true);
    fetchMarkets();
    fetchBlockHeight();
    if (address) {
      refreshBalance();
    }
  }, [address, fetchMarkets, fetchBlockHeight, refreshBalance]);

  useEffect(() => {
    async function loadPositions() {
      if (!address || markets.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const positionsWithMarket: PositionWithMarket[] = [];

      for (const market of markets) {
        try {
          const [position, prices] = await Promise.all([
            getUserPosition(market.marketId, address),
            getMarketPrices(market.marketId),
          ]);

          // Only include if user has a position
          if (
            position.yesBalance > BigInt(0) ||
            position.noBalance > BigInt(0) ||
            position.lpBalance > BigInt(0)
          ) {
            positionsWithMarket.push({
              market,
              position,
              prices: prices ? { yesPrice: prices.yesPrice, noPrice: prices.noPrice } : null,
            });
          }
        } catch (error) {
          console.error(`Error loading position for market ${market.marketId}:`, error);
        }
      }

      setPositions(positionsWithMarket);
      setLoading(false);
    }

    loadPositions();
  }, [address, markets]);

  // Calculate portfolio value
  const calculatePortfolioValue = () => {
    let totalValue = BigInt(0);

    for (const { market, position, prices } of positions) {
      if (market.isResolved) {
        // For resolved markets, winning tokens are worth face value
        if (market.winningOutcome === 0) {
          totalValue += position.yesBalance;
        } else if (market.winningOutcome === 1) {
          totalValue += position.noBalance;
        }
      } else if (prices) {
        // For active markets, calculate based on current prices
        const yesValue = (position.yesBalance * BigInt(prices.yesPrice)) / BigInt(1000000);
        const noValue = (position.noBalance * BigInt(prices.noPrice)) / BigInt(1000000);
        totalValue += yesValue + noValue;
      }

      // LP tokens are roughly worth face value
      totalValue += position.lpBalance;
    }

    return totalValue;
  };

  if (!mounted) return null;

  const portfolioValue = calculatePortfolioValue();

  // Separate active and resolved positions
  const activePositions = positions.filter(p => !p.market.isResolved);
  const resolvedPositions = positions.filter(p => p.market.isResolved);

  return (
    <main className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-12">Portfolio</h1>

        {!isConnected ? (
          <div className="card card-spacing text-center py-16">
            <Wallet className="w-16 h-16 text-text-secondary mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
            <p className="text-text-secondary mb-8 text-lg">
              Connect your wallet to view your positions and trading history
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio Summary */}
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="card card-spacing">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-brand-primary/10 flex items-center justify-center">
                    <Coins className="w-7 h-7 text-brand-primary" />
                  </div>
                  <span className="text-text-secondary font-semibold">USDCx Balance</span>
                </div>
                <p className="text-4xl font-bold">${formatTokenAmount(usdcxBalance)}</p>
              </div>

              <div className="card card-spacing">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-brand-secondary/10 flex items-center justify-center">
                    <TrendingUp className="w-7 h-7 text-brand-secondary" />
                  </div>
                  <span className="text-text-secondary font-semibold">Portfolio Value</span>
                </div>
                <p className="text-4xl font-bold">${formatTokenAmount(portfolioValue)}</p>
              </div>

              <div className="card card-spacing">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-yes/10 flex items-center justify-center">
                    <Trophy className="w-7 h-7 text-yes" />
                  </div>
                  <span className="text-text-secondary font-semibold">Active Positions</span>
                </div>
                <p className="text-4xl font-bold">{positions.length}</p>
              </div>
            </div>

            {/* Wallet Info */}
            <div className="card card-spacing mb-12">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base text-text-secondary mb-2 font-semibold">Connected Wallet</p>
                  <p className="font-mono text-lg">{formatAddress(address || '', 8)}</p>
                </div>
                <a
                  href={`https://explorer.hiro.so/address/${address}?chain=testnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-brand-primary hover:underline text-base font-semibold"
                >
                  View on Explorer
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>

            {loading ? (
              <TableSkeleton count={5} />
            ) : positions.length === 0 ? (
              <div className="card card-spacing text-center py-16">
                <TrendingUp className="w-16 h-16 text-text-secondary mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-3">No Positions Yet</h2>
                <p className="text-text-secondary mb-8 text-lg">
                  Start trading to build your portfolio
                </p>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-3 px-10 py-5 btn-gradient hover-scale gpu-accelerated text-base font-semibold"
                >
                  Browse Markets
                  <ArrowRight className="w-6 h-6" />
                </Link>
              </div>
            ) : (
              <>
                {/* Active Positions */}
                {activePositions.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                      <TrendingUp className="w-6 h-6 text-yes" />
                      Active Positions ({activePositions.length})
                    </h2>
                    <div className="space-y-6">
                      {activePositions.map(({ market, position, prices }) => (
                        <Link
                          key={market.marketId}
                          href={`/markets/${market.marketId}`}
                          className="card card-spacing block hover:border-brand-primary/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-6">
                            <div className="flex-1">
                              <p className="text-lg font-bold line-clamp-1">{market.question}</p>
                              <p className="text-base text-text-secondary mt-1">Market #{market.marketId}</p>
                            </div>
                            <ArrowRight className="w-6 h-6 text-text-secondary flex-shrink-0" />
                          </div>

                          <div className="grid grid-cols-3 gap-6">
                            {position.yesBalance > BigInt(0) && (
                              <div className="p-4 bg-yes/5 border border-yes/20">
                                <p className="text-sm text-text-secondary mb-2">YES Tokens</p>
                                <p className="text-xl font-bold text-yes">
                                  {formatTokenAmount(position.yesBalance)}
                                </p>
                                {prices && (
                                  <p className="text-sm text-text-secondary mt-1">
                                    @ {(prices.yesPrice / 10000).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            )}
                            {position.noBalance > BigInt(0) && (
                              <div className="p-4 bg-no/5 border border-no/20">
                                <p className="text-sm text-text-secondary mb-2">NO Tokens</p>
                                <p className="text-xl font-bold text-no">
                                  {formatTokenAmount(position.noBalance)}
                                </p>
                                {prices && (
                                  <p className="text-sm text-text-secondary mt-1">
                                    @ {(prices.noPrice / 10000).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            )}
                            {position.lpBalance > BigInt(0) && (
                              <div className="p-4 bg-brand-secondary/5 border border-brand-secondary/20">
                                <p className="text-sm text-text-secondary mb-2">LP Tokens</p>
                                <p className="text-xl font-bold text-brand-secondary">
                                  {formatTokenAmount(position.lpBalance)}
                                </p>
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved Positions */}
                {resolvedPositions.length > 0 && (
                  <div>
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                      <Trophy className="w-6 h-6 text-brand-secondary" />
                      Resolved Markets ({resolvedPositions.length})
                    </h2>
                    <div className="space-y-6">
                      {resolvedPositions.map(({ market, position }) => {
                        const isWinner =
                          (market.winningOutcome === 0 && position.yesBalance > BigInt(0)) ||
                          (market.winningOutcome === 1 && position.noBalance > BigInt(0));
                        const winningBalance =
                          market.winningOutcome === 0 ? position.yesBalance : position.noBalance;

                        return (
                          <Link
                            key={market.marketId}
                            href={`/markets/${market.marketId}`}
                            className="card card-spacing block hover:border-brand-primary/50 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-6">
                              <div className="flex-1">
                                <p className="text-lg font-bold line-clamp-1">{market.question}</p>
                                <p className="text-base text-text-secondary mt-1">
                                  Resolved: {market.winningOutcome === 0 ? 'YES' : 'NO'}
                                </p>
                              </div>
                              <ArrowRight className="w-6 h-6 text-text-secondary flex-shrink-0" />
                            </div>

                            {isWinner && winningBalance > BigInt(0) ? (
                              <div className="p-6 bg-yes/10 border border-yes/30">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Trophy className="w-6 h-6 text-yes" />
                                    <span className="text-lg font-bold text-yes">Winner!</span>
                                  </div>
                                  <span className="text-xl font-bold text-yes">
                                    Claim ${formatTokenAmount(winningBalance)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="p-6 bg-dark-hover text-center text-text-secondary">
                                No winnings to claim
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Quick Actions */}
            <div className="mt-12 grid grid-cols-2 gap-6">
              <Link
                href="/faucet"
                className="card card-spacing flex items-center gap-4 hover:border-brand-primary/50 transition-colors"
              >
                <div className="w-14 h-14 bg-brand-primary/10 flex items-center justify-center">
                  <Droplets className="w-7 h-7 text-brand-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">Get USDCx</p>
                  <p className="text-base text-text-secondary">Testnet faucet</p>
                </div>
              </Link>
              <Link
                href="/create"
                className="card card-spacing flex items-center gap-4 hover:border-brand-primary/50 transition-colors"
              >
                <div className="w-14 h-14 bg-brand-secondary/10 flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-brand-secondary" />
                </div>
                <div>
                  <p className="text-lg font-bold">Create Market</p>
                  <p className="text-base text-text-secondary">Start earning fees</p>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
