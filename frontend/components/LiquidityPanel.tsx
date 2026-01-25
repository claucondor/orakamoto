'use client';

import { useState } from 'react';
import { openContractCall } from '@stacks/connect';
import { uintCV, PostConditionMode } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { useWalletStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount, parseTokenAmount } from '@/lib/constants';
import type { Market, UserPosition } from '@/lib/contracts';
import { Plus, Minus, AlertCircle, Loader2, Droplets } from 'lucide-react';

interface LiquidityPanelProps {
  market: Market;
  position?: UserPosition;
  onActionComplete?: () => void;
}

export default function LiquidityPanel({ market, position, onActionComplete }: LiquidityPanelProps) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, usdcxBalance } = useWalletStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  const amountValue = parseFloat(amount) || 0;
  const amountInMicro = parseTokenAmount(amountValue);

  const lpBalance = position?.lpBalance || BigInt(0);

  const handleAddLiquidity = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    if (amountValue < 0.1) {
      setError('Minimum liquidity is 0.1 USDCx');
      return;
    }

    if (amountInMicro > usdcxBalance) {
      setError('Insufficient USDCx balance');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'add-liquidity',
        functionArgs: [
          uintCV(market.marketId),
          uintCV(Number(amountInMicro)),
        ],
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          setPendingTx(data.txId);
          setTxSuccess('Liquidity added successfully!');
          setAmount('');
          setIsSubmitting(false);
          if (onActionComplete) onActionComplete();
        },
        onCancel: () => {
          setIsSubmitting(false);
        },
      });
    } catch (err) {
      console.error('Add liquidity error:', err);
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setIsSubmitting(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    if (amountValue < 0.1) {
      setError('Minimum removal is 0.1 LP tokens');
      return;
    }

    if (amountInMicro > lpBalance) {
      setError('Insufficient LP balance');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'remove-liquidity',
        functionArgs: [
          uintCV(market.marketId),
          uintCV(Number(amountInMicro)),
        ],
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          setPendingTx(data.txId);
          setTxSuccess('Liquidity removed successfully!');
          setAmount('');
          setIsSubmitting(false);
          if (onActionComplete) onActionComplete();
        },
        onCancel: () => {
          setIsSubmitting(false);
        },
      });
    } catch (err) {
      console.error('Remove liquidity error:', err);
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setIsSubmitting(false);
    }
  };

  const isActive = !market.isResolved;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Droplets className="w-5 h-5 text-brand-secondary" />
          Liquidity
        </h3>
        {position && lpBalance > BigInt(0) && (
          <span className="text-sm text-text-muted">
            Your LP: {formatTokenAmount(lpBalance)}
          </span>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => setMode('add')}
          className={`py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            mode === 'add'
              ? 'bg-brand-secondary text-white'
              : 'bg-dark-hover text-text-secondary hover:text-white'
          }`}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
        <button
          onClick={() => setMode('remove')}
          disabled={lpBalance === BigInt(0)}
          className={`py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            mode === 'remove'
              ? 'bg-brand-secondary text-white'
              : 'bg-dark-hover text-text-secondary hover:text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Minus className="w-4 h-4" />
          Remove
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-6">
        <label className="label">
          {mode === 'add' ? 'Amount (USDCx)' : 'LP Tokens to Remove'}
        </label>
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
            onClick={() => {
              if (mode === 'add') {
                setAmount(formatTokenAmount(usdcxBalance).replace(/,/g, ''));
              } else {
                setAmount(formatTokenAmount(lpBalance).replace(/,/g, ''));
              }
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-primary hover:text-brand-primary/80"
          >
            MAX
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          {mode === 'add'
            ? `Balance: ${formatTokenAmount(usdcxBalance)} USDCx`
            : `LP Balance: ${formatTokenAmount(lpBalance)}`
          }
        </p>
      </div>

      {/* Info Box */}
      <div className="mb-6 p-4 bg-dark-hover rounded-lg">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-text-muted">Pool Liquidity</span>
          <span>${formatTokenAmount(market.totalLiquidity)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">LP Fee Share</span>
          <span className="text-yes">70%</span>
        </div>
        {mode === 'add' && amountValue > 0 && (
          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dark-border">
            <span className="text-text-muted">Est. LP Tokens</span>
            <span>~{amountValue.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-no/10 border border-no/30 rounded-lg flex items-center gap-2 text-no text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={mode === 'add' ? handleAddLiquidity : handleRemoveLiquidity}
        disabled={!isConnected || !isActive || isSubmitting || amountValue < 0.1}
        className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-brand-secondary hover:bg-brand-secondary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Confirming...
          </>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : !isActive ? (
          'Market Closed'
        ) : mode === 'add' ? (
          <>
            <Plus className="w-5 h-5" />
            Add Liquidity
          </>
        ) : (
          <>
            <Minus className="w-5 h-5" />
            Remove Liquidity
          </>
        )}
      </button>
    </div>
  );
}
