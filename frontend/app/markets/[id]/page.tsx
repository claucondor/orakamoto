'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { openContractCall } from '@stacks/connect';
import { uintCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { getMarket, getMarketPrices, getUserPosition } from '@/lib/contracts';
import { useWalletStore, useMarketsStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount, formatAddress, timeUntilBlock } from '@/lib/constants';
import TradingPanel from '@/components/TradingPanel';
import LiquidityPanel from '@/components/LiquidityPanel';
import UserPositions from '@/components/UserPositions';
import type { Market, UserPosition } from '@/lib/contracts';
import {
  ArrowLeft,
  Clock,
  Users,
  TrendingUp,
  Droplets,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Gavel,
  AlertTriangle,
} from 'lucide-react';

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = parseInt(params.id as string);

  const [market, setMarket] = useState<Market | null>(null);
  const [prices, setPrices] = useState<{ yesPrice: number; noPrice: number } | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1>(0);

  const { address, isConnected } = useWalletStore();
  const { currentBlockHeight, fetchBlockHeight } = useMarketsStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  useEffect(() => {
    fetchBlockHeight();
  }, [fetchBlockHeight]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [marketData, pricesData] = await Promise.all([
          getMarket(marketId),
          getMarketPrices(marketId),
        ]);

        setMarket(marketData);
        if (pricesData) {
          setPrices({
            yesPrice: pricesData.yesPrice,
            noPrice: pricesData.noPrice,
          });
        }

        if (address && marketData) {
          const pos = await getUserPosition(marketId, address);
          setPosition(pos);
        }
      } catch (error) {
        console.error('Error fetching market:', error);
      }
      setLoading(false);
    }

    if (marketId) {
      fetchData();
    }
  }, [marketId, address]);

  const refreshData = async () => {
    const [marketData, pricesData] = await Promise.all([
      getMarket(marketId),
      getMarketPrices(marketId),
    ]);
    setMarket(marketData);
    if (pricesData) {
      setPrices({
        yesPrice: pricesData.yesPrice,
        noPrice: pricesData.noPrice,
      });
    }
    if (address) {
      const pos = await getUserPosition(marketId, address);
      setPosition(pos);
    }
  };

  const handleResolve = async () => {
    if (!isConnected || !address || !market) return;

    setIsResolving(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'resolve',
        functionArgs: [
          uintCV(marketId),
          uintCV(selectedOutcome),
        ],
        onFinish: (data) => {
          setPendingTx(data.txId);
          setTxSuccess('Market resolved!');
          setIsResolving(false);
          refreshData();
        },
        onCancel: () => {
          setIsResolving(false);
        },
      });
    } catch (err) {
      console.error('Resolve error:', err);
      setTxError(err instanceof Error ? err.message : 'Resolution failed');
      setIsResolving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
            <p className="text-text-muted">Loading market...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4">Market Not Found</h2>
            <p className="text-text-muted mb-6">This market does not exist or has been removed.</p>
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Markets
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isActive = !market.isResolved && currentBlockHeight < market.deadline;
  const canResolve = address === market.creator && !market.isResolved && currentBlockHeight >= market.deadline;
  const timeRemaining = timeUntilBlock(market.deadline, currentBlockHeight);

  // Price percentages
  const yesPercent = prices ? (prices.yesPrice / 10000).toFixed(1) : '50.0';
  const noPercent = prices ? (prices.noPrice / 10000).toFixed(1) : '50.0';

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          href="/markets"
          className="inline-flex items-center gap-2 text-text-muted hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Market Header */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {market.isResolved ? (
                    <span className="flex items-center gap-1 px-3 py-1 bg-brand-secondary/10 text-brand-secondary text-sm font-medium rounded-full">
                      <CheckCircle className="w-4 h-4" />
                      Resolved
                    </span>
                  ) : isActive ? (
                    <span className="flex items-center gap-1 px-3 py-1 bg-yes/10 text-yes text-sm font-medium rounded-full">
                      <span className="w-2 h-2 rounded-full bg-yes animate-pulse"></span>
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-3 py-1 bg-warning/10 text-warning text-sm font-medium rounded-full">
                      <Clock className="w-4 h-4" />
                      Awaiting Resolution
                    </span>
                  )}
                  <span className="text-sm text-text-muted">Market #{market.marketId}</span>
                </div>
              </div>

              <h1 className="text-2xl font-bold mb-4">{market.question}</h1>

              {/* Price Display */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-yes/5 border border-yes/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-muted">YES Price</span>
                    <span className="text-2xl font-bold text-yes">{yesPercent}%</span>
                  </div>
                  <div className="h-2 bg-dark-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yes transition-all duration-500"
                      style={{ width: `${yesPercent}%` }}
                    ></div>
                  </div>
                </div>
                <div className="p-4 bg-no/5 border border-no/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-muted">NO Price</span>
                    <span className="text-2xl font-bold text-no">{noPercent}%</span>
                  </div>
                  <div className="h-2 bg-dark-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-no transition-all duration-500"
                      style={{ width: `${noPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Market Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <TrendingUp className="w-5 h-5 text-brand-primary mb-2" />
                  <p className="stat-value">${formatTokenAmount(market.totalLiquidity)}</p>
                  <p className="stat-label">Liquidity</p>
                </div>
                <div className="stat-card">
                  <Droplets className="w-5 h-5 text-brand-secondary mb-2" />
                  <p className="stat-value">${formatTokenAmount(market.accumulatedFees)}</p>
                  <p className="stat-label">Fees Earned</p>
                </div>
                <div className="stat-card">
                  <Clock className="w-5 h-5 text-warning mb-2" />
                  <p className="stat-value">{timeRemaining}</p>
                  <p className="stat-label">Time Left</p>
                </div>
                <div className="stat-card">
                  <Users className="w-5 h-5 text-text-muted mb-2" />
                  <p className="stat-value font-mono text-sm">{formatAddress(market.creator)}</p>
                  <p className="stat-label">Creator</p>
                </div>
              </div>

              {/* Resolved Outcome */}
              {market.isResolved && market.winningOutcome !== null && (
                <div className="mt-6 pt-6 border-t border-dark-border">
                  <div className={`flex items-center justify-center gap-3 py-4 rounded-xl ${
                    market.winningOutcome === 0 ? 'bg-yes/10' : 'bg-no/10'
                  }`}>
                    {market.winningOutcome === 0 ? (
                      <>
                        <CheckCircle className="w-6 h-6 text-yes" />
                        <span className="text-xl font-bold text-yes">Outcome: YES</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-6 h-6 text-no" />
                        <span className="text-xl font-bold text-no">Outcome: NO</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Resolution Panel (Creator Only) */}
            {canResolve && (
              <div className="card border-warning/50">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Gavel className="w-5 h-5 text-warning" />
                  Resolve Market
                </h3>

                <div className="p-4 bg-warning/10 rounded-lg mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-warning font-medium">Important</p>
                    <p className="text-sm text-text-muted">
                      As the market creator, you can resolve this market. Choose the outcome
                      carefully - this action triggers a dispute window before claims are enabled.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    onClick={() => setSelectedOutcome(0)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      selectedOutcome === 0
                        ? 'border-yes bg-yes/10'
                        : 'border-dark-border hover:border-yes/50'
                    }`}
                  >
                    <CheckCircle className={`w-6 h-6 mx-auto mb-2 ${
                      selectedOutcome === 0 ? 'text-yes' : 'text-text-muted'
                    }`} />
                    <span className={`font-bold ${selectedOutcome === 0 ? 'text-yes' : 'text-text-muted'}`}>
                      YES Won
                    </span>
                  </button>
                  <button
                    onClick={() => setSelectedOutcome(1)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      selectedOutcome === 1
                        ? 'border-no bg-no/10'
                        : 'border-dark-border hover:border-no/50'
                    }`}
                  >
                    <XCircle className={`w-6 h-6 mx-auto mb-2 ${
                      selectedOutcome === 1 ? 'text-no' : 'text-text-muted'
                    }`} />
                    <span className={`font-bold ${selectedOutcome === 1 ? 'text-no' : 'text-text-muted'}`}>
                      NO Won
                    </span>
                  </button>
                </div>

                <button
                  onClick={handleResolve}
                  disabled={isResolving}
                  className="w-full py-3 rounded-xl font-bold bg-warning text-dark-bg hover:bg-warning/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <Gavel className="w-5 h-5" />
                      Resolve as {selectedOutcome === 0 ? 'YES' : 'NO'}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* User Positions */}
            <UserPositions market={market} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Trading Panel */}
            <TradingPanel market={market} onTradeComplete={refreshData} />

            {/* Liquidity Panel */}
            <LiquidityPanel
              market={market}
              position={position || undefined}
              onActionComplete={refreshData}
            />

            {/* Market Info */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Market Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Contract</span>
                  <a
                    href={`https://explorer.hiro.so/txid/${CONTRACTS.DEPLOYER}.${CONTRACTS.MULTI_MARKET_POOL}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline flex items-center gap-1"
                  >
                    View
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Created at Block</span>
                  <span>{market.createdAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Deadline Block</span>
                  <span>{market.deadline}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Current Block</span>
                  <span>{currentBlockHeight}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Trading Fee</span>
                  <span>1%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">LP Fee Share</span>
                  <span className="text-yes">70%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
