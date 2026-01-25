'use client';

import { useEffect, useState } from 'react';
import { openContractCall } from '@stacks/connect';
import { uintCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { useWalletStore, useTxStore } from '@/lib/store';
import { CONTRACTS, formatTokenAmount } from '@/lib/constants';
import { getUserPosition, getClaimStatus } from '@/lib/contracts';
import type { Market, UserPosition } from '@/lib/contracts';
import { Wallet, Trophy, Loader2, CheckCircle } from 'lucide-react';

interface UserPositionsProps {
  market: Market;
}

export default function UserPositions({ market }: UserPositionsProps) {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [claimStatus, setClaimStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);

  const { address, isConnected } = useWalletStore();
  const { setPendingTx, setTxSuccess, setTxError } = useTxStore();

  useEffect(() => {
    async function fetchData() {
      if (!address) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [pos, status] = await Promise.all([
          getUserPosition(market.marketId, address),
          market.isResolved ? getClaimStatus(market.marketId, address) : null,
        ]);
        setPosition(pos);
        setClaimStatus(status);
      } catch (error) {
        console.error('Error fetching position:', error);
      }
      setLoading(false);
    }

    fetchData();
  }, [address, market.marketId, market.isResolved]);

  const handleClaim = async () => {
    if (!isConnected || !address) return;

    setIsClaiming(true);

    try {
      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: CONTRACTS.DEPLOYER,
        contractName: CONTRACTS.MULTI_MARKET_POOL,
        functionName: 'claim',
        functionArgs: [uintCV(market.marketId)],
        onFinish: (data) => {
          setPendingTx(data.txId);
          setTxSuccess('Winnings claimed successfully!');
          setIsClaiming(false);
        },
        onCancel: () => {
          setIsClaiming(false);
        },
      });
    } catch (err) {
      console.error('Claim error:', err);
      setTxError(err instanceof Error ? err.message : 'Claim failed');
      setIsClaiming(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Wallet className="w-5 h-5" />
          Your Position
        </h3>
        <p className="text-center text-text-muted py-4">
          Connect wallet to view your position
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Wallet className="w-5 h-5" />
          Your Position
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
        </div>
      </div>
    );
  }

  const hasPosition = position && (
    position.yesBalance > BigInt(0) ||
    position.noBalance > BigInt(0) ||
    position.lpBalance > BigInt(0)
  );

  // Calculate winnings if resolved
  const canClaim = claimStatus?.claimsEnabled && !claimStatus?.hasClaimed;
  const winningBalance = market.isResolved && market.winningOutcome !== null && position
    ? (market.winningOutcome === 0 ? position.yesBalance : position.noBalance)
    : BigInt(0);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Wallet className="w-5 h-5" />
        Your Position
      </h3>

      {!hasPosition ? (
        <p className="text-center text-text-muted py-4">
          No position in this market
        </p>
      ) : (
        <div className="space-y-4">
          {/* Outcome Tokens */}
          {(position.yesBalance > BigInt(0) || position.noBalance > BigInt(0)) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-yes/5 border border-yes/20 rounded-lg">
                <p className="text-xs text-text-muted mb-1">YES Tokens</p>
                <p className="text-lg font-bold text-yes">
                  {formatTokenAmount(position.yesBalance)}
                </p>
              </div>
              <div className="p-4 bg-no/5 border border-no/20 rounded-lg">
                <p className="text-xs text-text-muted mb-1">NO Tokens</p>
                <p className="text-lg font-bold text-no">
                  {formatTokenAmount(position.noBalance)}
                </p>
              </div>
            </div>
          )}

          {/* LP Tokens */}
          {position.lpBalance > BigInt(0) && (
            <div className="p-4 bg-brand-secondary/5 border border-brand-secondary/20 rounded-lg">
              <p className="text-xs text-text-muted mb-1">LP Tokens</p>
              <p className="text-lg font-bold text-brand-secondary">
                {formatTokenAmount(position.lpBalance)}
              </p>
            </div>
          )}

          {/* Claim Section for Resolved Markets */}
          {market.isResolved && (
            <div className="pt-4 border-t border-dark-border">
              {claimStatus?.hasClaimed ? (
                <div className="flex items-center justify-center gap-2 p-4 bg-yes/10 rounded-lg text-yes">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Winnings Claimed</span>
                </div>
              ) : canClaim && winningBalance > BigInt(0) ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-text-muted">Claimable</span>
                    <span className="text-lg font-bold text-yes">
                      ${formatTokenAmount(winningBalance)} USDCx
                    </span>
                  </div>
                  <button
                    onClick={handleClaim}
                    disabled={isClaiming}
                    className="w-full py-3 rounded-xl font-bold bg-yes text-white hover:bg-yes/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Trophy className="w-5 h-5" />
                        Claim Winnings
                      </>
                    )}
                  </button>
                </div>
              ) : !claimStatus?.claimsEnabled ? (
                <div className="text-center p-4 bg-warning/10 rounded-lg text-warning">
                  <p className="text-sm">Dispute window active</p>
                  <p className="text-xs text-text-muted mt-1">
                    Claims available after block {claimStatus?.disputeWindowEnds}
                  </p>
                </div>
              ) : winningBalance === BigInt(0) ? (
                <div className="text-center p-4 bg-dark-hover rounded-lg text-text-muted">
                  No winnings to claim
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
