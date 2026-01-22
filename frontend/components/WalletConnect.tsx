'use client';

import { useState, useEffect } from 'react';
import { AppConfig, UserSession, showConnect } from '@stacks/connect';

const appConfig = new AppConfig(['store_write', 'publish_data']);
const userSession = new UserSession({ appConfig });

export default function WalletConnect() {
  const [mounted, setMounted] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    if (userSession.isUserSignedIn()) {
      setUserData(userSession.loadUserData());
    }
  }, []);

  const connectWallet = () => {
    showConnect({
      appDetails: {
        name: 'StacksPredict',
        icon: typeof window !== 'undefined' ? window.location.origin + '/logo.png' : '',
      },
      redirectTo: '/',
      onFinish: () => {
        window.location.reload();
      },
      userSession,
    });
  };

  const disconnectWallet = () => {
    userSession.signUserOut();
    window.location.reload();
  };

  if (!mounted) return null;

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      {userData ? (
        <div>
          <p className="text-sm text-gray-600 mb-2">Connected</p>
          <p className="font-mono text-xs break-all mb-3">
            {userData.profile.stxAddress.testnet}
          </p>
          <button
            onClick={disconnectWallet}
            className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connectWallet}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Connect Wallet
        </button>
      )}
    </div>
  );
}
