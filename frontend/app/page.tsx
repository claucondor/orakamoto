'use client';

import { useState, useEffect } from 'react';
import { UserSession, AppConfig } from '@stacks/connect';
import WalletConnect from '@/components/WalletConnect';
import USDCxBalance from '@/components/USDCxBalance';
import Bridge from '@/components/Bridge';
import Link from 'next/link';

const appConfig = new AppConfig(['store_write', 'publish_data']);
const userSession = new UserSession({ appConfig });

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (userSession.isUserSignedIn()) {
      const userData = userSession.loadUserData();
      setAddress(userData.profile.stxAddress.testnet);
    }
  }, []);

  return (
    <main className="min-h-screen p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 text-blue-900">
          StacksPredict
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Prediction Markets powered by USDCx on Stacks
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <WalletConnect />
          {address && <USDCxBalance address={address} />}
        </div>

        {/* Bridge Section */}
        <div className="mb-8">
          <Bridge stacksAddress={address} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/create"
              className="block p-4 border-2 border-blue-500 rounded-lg hover:bg-blue-50 transition"
            >
              <span className="text-lg font-semibold text-blue-600">
                Create Market
              </span>
              <p className="text-sm text-gray-600">Start a new prediction market</p>
            </Link>

            <Link
              href="/markets"
              className="block p-4 border-2 border-green-500 rounded-lg hover:bg-green-50 transition"
            >
              <span className="text-lg font-semibold text-green-600">
                Browse Markets
              </span>
              <p className="text-sm text-gray-600">Explore active prediction markets</p>
            </Link>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-100 border-l-4 border-yellow-500 rounded">
          <p className="font-semibold">Hackathon Demo</p>
          <p className="text-sm">
            This is a minimal MVP demonstrating USDCx integration on Stacks via Circle xReserve.
          </p>
        </div>
      </div>
    </main>
  );
}
