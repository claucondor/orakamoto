'use client';

import { useState, useEffect } from 'react';
import { callReadOnlyFunction, cvToJSON, principalCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

// TODO: Update this when USDCx contract address is known
const USDCX_CONTRACT = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';

export default function USDCxBalance({ address }: { address: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    const fetchBalance = async () => {
      try {
        const [contractAddress, contractName] = USDCX_CONTRACT.split('.');

        const result = await callReadOnlyFunction({
          network: new StacksTestnet(),
          contractAddress,
          contractName,
          functionName: 'get-balance',
          functionArgs: [principalCV(address)],
          senderAddress: address,
        });

        const jsonResult = cvToJSON(result);
        const balanceValue = jsonResult.value?.value || 0;
        setBalance(Number(balanceValue) / 1_000_000);
      } catch (error) {
        console.error('Error fetching USDCx balance:', error);
        setBalance(0);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [address]);

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      <p className="text-lg font-bold mb-2">USDCx Balance</p>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <p className="text-3xl font-bold text-blue-600">
          {balance !== null ? `${balance.toFixed(2)} USDCx` : 'Error'}
        </p>
      )}
    </div>
  );
}
