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
  Loader2,
  ExternalLink,
  Coins,
} from 'lucide-react';

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
    <main className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-8">Portfolio</h1>

        {!isConnected ? (
          <div className="card text-center py-12">
            <Wallet className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-text-muted mb-6">
              Connect your wallet to view your positions and trading history
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio Summary */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center">
                    <Coins className="w-5 h-5 text-brand-primary" />
                  </div>
                  <span className="text-text-muted">USDCx Balance</span>
                </div>
                <p className="text-3xl font-bold">${formatTokenAmount(usdcxBalance)}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-brand-secondary/10 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-brand-secondary" />
                  </div>
                  <span className="text-text-muted">Portfolio Value</span>
                </div>
                <p className="text-3xl font-bold">${formatTokenAmount(portfolioValue)}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-yes/10 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-yes" />
                  </div>
                  <span className="text-text-muted">Active Positions</span>
                </div>
                <p className="text-3xl font-bold">{positions.length}</p>
              </div>
            </div>

            {/* Wallet Info */}
            <div className="card mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-muted mb-1">Connected Wallet</p>
                  <p className="font-mono">{formatAddress(address || '', 8)}</p>
                </div>
                <a
                  href={`https://explorer.hiro.so/address/${address}?chain=testnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-brand-primary hover:underline"
                >
                  View on Explorer
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
                <p className="text-text-muted">Loading positions...</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="card text-center py-12">
                <TrendingUp className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">No Positions Yet</h2>
                <p className="text-text-muted mb-6">
                  Start trading to build your portfolio
                </p>
                <Link
                  href="/markets"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all"
                >
                  Browse Markets
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            ) : (
              <>
                {/* Active Positions */}
                {activePositions.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-yes" />
                      Active Positions ({activePositions.length})
                    </h2>
                    <div className="space-y-4">
                      {activePositions.map(({ market, position, prices }) => (
                        <Link
                          key={market.marketId}
                          href={`/markets/${market.marketId}`}
                          className="card block hover:border-brand-primary/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <p className="font-semibold line-clamp-1">{market.question}</p>
                              <p className="text-sm text-text-muted">Market #{market.marketId}</p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-text-muted flex-shrink-0" />
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                            {position.yesBalance > BigInt(0) && (
                              <div className="p-3 bg-yes/5 border border-yes/20 rounded-lg">
                                <p className="text-xs text-text-muted mb-1">YES Tokens</p>
                                <p className="font-bold text-yes">
                                  {formatTokenAmount(position.yesBalance)}
                                </p>
                                {prices && (
                                  <p className="text-xs text-text-muted">
                                    @ {(prices.yesPrice / 10000).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            )}
                            {position.noBalance > BigInt(0) && (
                              <div className="p-3 bg-no/5 border border-no/20 rounded-lg">
                                <p className="text-xs text-text-muted mb-1">NO Tokens</p>
                                <p className="font-bold text-no">
                                  {formatTokenAmount(position.noBalance)}
                                </p>
                                {prices && (
                                  <p className="text-xs text-text-muted">
                                    @ {(prices.noPrice / 10000).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                            )}
                            {position.lpBalance > BigInt(0) && (
                              <div className="p-3 bg-brand-secondary/5 border border-brand-secondary/20 rounded-lg">
                                <p className="text-xs text-text-muted mb-1">LP Tokens</p>
                                <p className="font-bold text-brand-secondary">
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
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-brand-secondary" />
                      Resolved Markets ({resolvedPositions.length})
                    </h2>
                    <div className="space-y-4">
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
                            className="card block hover:border-brand-primary/50 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <p className="font-semibold line-clamp-1">{market.question}</p>
                                <p className="text-sm text-text-muted">
                                  Resolved: {market.winningOutcome === 0 ? 'YES' : 'NO'}
                                </p>
                              </div>
                              <ArrowRight className="w-5 h-5 text-text-muted flex-shrink-0" />
                            </div>

                            {isWinner && winningBalance > BigInt(0) ? (
                              <div className="p-4 bg-yes/10 border border-yes/30 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-yes" />
                                    <span className="font-medium text-yes">Winner!</span>
                                  </div>
                                  <span className="font-bold text-yes">
                                    Claim ${formatTokenAmount(winningBalance)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 bg-dark-hover rounded-lg text-center text-text-muted">
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
            <div className="mt-8 grid grid-cols-2 gap-4">
              <Link
                href="/faucet"
                className="card flex items-center gap-3 hover:border-brand-primary/50 transition-colors"
              >
                <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center">
                  <Droplets className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <p className="font-medium">Get USDCx</p>
                  <p className="text-sm text-text-muted">Testnet faucet</p>
                </div>
              </Link>
              <Link
                href="/create"
                className="card flex items-center gap-3 hover:border-brand-primary/50 transition-colors"
              >
                <div className="w-10 h-10 bg-brand-secondary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-brand-secondary" />
                </div>
                <div>
                  <p className="font-medium">Create Market</p>
                  <p className="text-sm text-text-muted">Start earning fees</p>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
