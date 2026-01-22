'use client';

import { useState } from 'react';
import { openContractCall } from '@stacks/connect';
import { stringUtf8CV, uintCV } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import Link from 'next/link';

// TODO: Update with actual deployed contract address
const MARKET_FACTORY_ADDRESS = 'ST7NF22X51JPBHWRDCM29FKFJ8NSWY4NEW7ZEMZF';
const MARKET_FACTORY_NAME = 'market-factory';

export default function CreateMarket() {
  const [question, setQuestion] = useState('');
  const [deadline, setDeadline] = useState('');
  const [liquidity, setLiquidity] = useState('10');
  const [txId, setTxId] = useState('');
  const [error, setError] = useState('');

  const createMarket = async () => {
    try {
      setError('');
      const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);

      await openContractCall({
        network: new StacksTestnet(),
        contractAddress: MARKET_FACTORY_ADDRESS,
        contractName: MARKET_FACTORY_NAME,
        functionName: 'create-market',
        functionArgs: [
          stringUtf8CV(question),
          stringUtf8CV(''),
          uintCV(deadlineTimestamp),
          uintCV(Number(liquidity) * 1_000_000),
        ],
        onFinish: (data) => {
          setTxId(data.txId);
        },
        onCancel: () => {
          setError('Transaction cancelled');
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-8">Create Prediction Market</h1>

        <div className="bg-white p-6 rounded-lg shadow space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Market Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Will Bitcoin reach $100k by Feb 2026?"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Resolution Deadline
            </label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Initial Liquidity (USDCx)
            </label>
            <input
              type="number"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              min="1"
              step="0.1"
            />
            <p className="text-sm text-gray-600 mt-1">
              Minimum 50 USDCx required
            </p>
          </div>

          <button
            onClick={createMarket}
            disabled={!question || !deadline || !liquidity}
            className="w-full p-4 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            Create Market
          </button>

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {txId && (
            <div className="p-4 bg-green-100 border border-green-400 rounded-lg">
              <p className="font-semibold text-green-800">Market created!</p>
              <a
                href={`https://explorer.hiro.so/txid/${txId}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View transaction →
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
