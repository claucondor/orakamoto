'use client';

import { useState, useEffect } from 'react';
import { openContractCall } from '@stacks/connect';
import { uintCV, boolCV, PostConditionMode } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { useWalletStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount, parseTokenAmount } from '@/lib/constants';
import { getMarketPrices } from '@/lib/contracts';
import type { Market } from '@/lib/contracts';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

interface TradingPanelProps {
  market: Market;
  onTradeComplete?: () => void;
}

export default function TradingPanel({ market, onTradeComplete }: TradingPanelProps) {
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prices, setPrices] = useState<{ yesPrice: number; noPrice: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, usdcxBalance } = useWalletStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  useEffect(() => {
    async function fetchPrices() {
      const marketPrices = await getMarketPrices(market.marketId);
      if (marketPrices) {
        setPrices({
          yesPrice: marketPrices.yesPrice,
          noPrice: marketPrices.noPrice,
        });
      }
    }
    fetchPrices();
  }, [market.marketId]);

  // Calculate estimated tokens out
  const amountValue = parseFloat(amount) || 0;
  const amountInMicro = parseTokenAmount(amountValue);

  // Simple approximation using constant product formula (x * y = k)
  // More accurate than price-based, accounts for slippage
  const calculateApproximateTokens = () => {
    if (amountValue <= 0 || !market) return 0;

    // Get reserves for the outcome we're buying
    const yesReserve = Number(market.yesReserve);
    const noReserve = Number(market.noReserve);

    // Amount after 3% minimum fee
    const amountAfterFee = amountValue * 0.97;
    const amountAfterFeeMicro = amountAfterFee * 1000000;

    // Constant product: (x + dx) * (y - dy) = x * y
    // Solving for dy (tokens out)
    if (outcome === 'yes') {
      // Buying YES: add to NO reserve, remove from YES reserve
      const newNoReserve = noReserve + amountAfterFeeMicro;
      const k = yesReserve * noReserve;
      const newYesReserve = k / newNoReserve;
      const tokensOut = yesReserve - newYesReserve;
      return tokensOut / 1000000; // Convert to tokens
    } else {
      // Buying NO: add to YES reserve, remove from NO reserve
      const newYesReserve = yesReserve + amountAfterFeeMicro;
      const k = yesReserve * noReserve;
      const newNoReserve = k / newYesReserve;
      const tokensOut = noReserve - newNoReserve;
      return tokensOut / 1000000; // Convert to tokens
    }
  };

  const estimatedTokens = calculateApproximateTokens();
  const calculatedFee = amountValue * 0.03; // Conservative 3% minimum

  // Calculate min tokens with slippage (in micro-tokens for contract)
  const minTokensOutMicro = Math.floor(estimatedTokens * 1000000 * (1 - slippage / 100));

  // Check if trade is too large relative to liquidity
  const tradePercentage = (Number(amountInMicro) / Number(market.totalLiquidity)) * 100;
  const isLargeTrade = tradePercentage > 10;

  const handleTrade = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    if (amountValue <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amountInMicro > usdcxBalance) {
      setError('Insufficient USDCx balance');
      return;
    }

    // Warn about very low liquidity
    if (Number(market.totalLiquidity) < 5_000_000n) {
      setError('Market has very low liquidity (< $5). Trades may fail due to slippage.');
      return;
    }

    // Block trades that are too large (prevent catastrophic slippage)
    if (tradePercentage > 50) {
      setError(`Trade too large (${tradePercentage.toFixed(0)}% of liquidity). Max 50%. Add liquidity first.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'buy-outcome',
        functionArgs: [
          uintCV(market.marketId),
          uintCV(outcome === 'yes' ? 0 : 1), // 0 = YES, 1 = NO
          uintCV(Number(amountInMicro)),
          uintCV(minTokensOutMicro), // Already in micro-tokens
        ],
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          setPendingTx(data.txId);
          setTxSuccess(`Bought ${outcome.toUpperCase()} tokens!`);
          setAmount('');
          setIsSubmitting(false);
          if (onTradeComplete) onTradeComplete();
        },
        onCancel: () => {
          setIsSubmitting(false);
        },
      });
    } catch (err) {
      console.error('Trade error:', err);
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setIsSubmitting(false);
    }
  };

  const isActive = !market.isResolved && market.deadline > 0;

  if (!isActive) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Trading</h3>
        <div className="text-center py-8 text-text-muted">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>This market is no longer accepting trades</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Trade</h3>

      {/* Outcome Selection */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setOutcome('yes')}
          className={`p-4 rounded-xl border-2 transition-all ${
            outcome === 'yes'
              ? 'border-yes bg-yes/10'
              : 'border-dark-border hover:border-yes/50'
          }`}
        >
          <div className="text-lg font-bold text-yes mb-1">YES</div>
          <div className="text-sm text-text-muted">
            {prices ? `${(prices.yesPrice / 10000).toFixed(1)}%` : '...'}
          </div>
        </button>
        <button
          onClick={() => setOutcome('no')}
          className={`p-4 rounded-xl border-2 transition-all ${
            outcome === 'no'
              ? 'border-no bg-no/10'
              : 'border-dark-border hover:border-no/50'
          }`}
        >
          <div className="text-lg font-bold text-no mb-1">NO</div>
          <div className="text-sm text-text-muted">
            {prices ? `${(prices.noPrice / 10000).toFixed(1)}%` : '...'}
          </div>
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-6">
        <label className="label">Amount (USDCx)</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input pr-20"
            min="0"
            step="0.01"
          />
          <button
            onClick={() => setAmount(formatTokenAmount(usdcxBalance).replace(/,/g, ''))}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-primary hover:text-brand-primary/80"
          >
            MAX
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Balance: ${formatTokenAmount(usdcxBalance)} USDCx
        </p>
      </div>

      {/* Slippage Tolerance */}
      <div className="mb-6">
        <label className="label">Slippage Tolerance</label>
        <div className="flex gap-2">
          {[1, 3, 5, 10].map((val) => (
            <button
              key={val}
              onClick={() => setSlippage(val)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                slippage === val
                  ? 'bg-brand-primary text-white'
                  : 'bg-dark-hover text-text-secondary hover:text-white'
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {/* Liquidity Warning */}
      {isLargeTrade && amountValue > 0 && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2 text-yellow-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">High Slippage Warning</p>
            <p className="text-xs mt-1 text-yellow-500/80">
              You're buying {tradePercentage.toFixed(1)}% of total liquidity (${formatTokenAmount(market.totalLiquidity)}).
              Expect significant price impact. Consider adding liquidity first or reducing trade size.
            </p>
          </div>
        </div>
      )}

      {/* Trade Summary */}
      {amountValue > 0 && (
        <div className="mb-6 p-4 bg-dark-hover rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">You pay</span>
            <span>${amountValue.toFixed(2)} USDCx</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Trading fee (~3%+)</span>
            <span className="text-text-muted">~${calculatedFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Market liquidity</span>
            <span className="text-text-muted">${formatTokenAmount(market.totalLiquidity)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-dark-border">
            <span className="text-text-muted">Est. tokens received</span>
            <span className={outcome === 'yes' ? 'text-yes' : 'text-no'}>
              ~{estimatedTokens.toFixed(4)} {outcome.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Min. tokens ({slippage}% slippage)</span>
            <span className="text-text-muted">
              {(minTokensOutMicro / 1000000).toFixed(4)} {outcome.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-no/10 border border-no/30 rounded-lg flex items-center gap-2 text-no text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Trade Button */}
      <button
        onClick={handleTrade}
        disabled={!isConnected || isSubmitting || amountValue <= 0}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
          outcome === 'yes'
            ? 'bg-yes hover:bg-yes/90 text-white'
            : 'bg-no hover:bg-no/90 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Confirming...
          </>
        ) : !isConnected ? (
          'Connect Wallet to Trade'
        ) : (
          <>
            Buy {outcome.toUpperCase()}
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
}
