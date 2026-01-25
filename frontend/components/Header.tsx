'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { showConnect } from '@stacks/connect';
import { useWalletStore, userSession } from '@/lib/store';
import { formatAddress, formatTokenAmount } from '@/lib/constants';
import { Menu, X, Wallet, ChevronDown, LogOut, ExternalLink } from 'lucide-react';

const navigation = [
  { name: 'Markets', href: '/markets' },
  { name: 'Create', href: '/create' },
  { name: 'Bridge', href: '/bridge' },
  { name: 'Portfolio', href: '/portfolio' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { address, isConnected, usdcxBalance, setAddress, disconnect, refreshBalance } = useWalletStore();

  useEffect(() => {
    setMounted(true);
    if (userSession.isUserSignedIn()) {
      const userData = userSession.loadUserData();
      setAddress(userData.profile.stxAddress.testnet);
    }
  }, [setAddress]);

  const connectWallet = () => {
    showConnect({
      appDetails: {
        name: 'Orakamoto',
        icon: typeof window !== 'undefined' ? window.location.origin + '/logo.png' : '',
      },
      redirectTo: '/',
      onFinish: () => {
        if (userSession.isUserSignedIn()) {
          const userData = userSession.loadUserData();
          setAddress(userData.profile.stxAddress.testnet);
        }
      },
      userSession,
    });
  };

  const handleDisconnect = () => {
    disconnect();
    setWalletMenuOpen(false);
    window.location.reload();
  };

  if (!mounted) return null;

  return (
    <header className="sticky top-0 z-50 bg-dark-bg/80 backdrop-blur-xl border-b border-dark-border">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
                <span className="text-white font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:block">
                Orakamoto
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-dark-hover text-white'
                    : 'text-text-secondary hover:text-white hover:bg-dark-hover'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center gap-4">
            {isConnected && address ? (
              <div className="relative">
                <button
                  onClick={() => setWalletMenuOpen(!walletMenuOpen)}
                  className="flex items-center gap-3 px-4 py-2 bg-dark-card border border-dark-border rounded-lg hover:bg-dark-hover transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yes animate-pulse"></div>
                    <span className="text-sm font-medium">{formatAddress(address)}</span>
                  </div>
                  <div className="h-4 w-px bg-dark-border"></div>
                  <span className="text-sm text-brand-primary font-medium">
                    ${formatTokenAmount(usdcxBalance)}
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                </button>

                {/* Wallet Dropdown */}
                {walletMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setWalletMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-dark-card border border-dark-border rounded-xl shadow-xl z-20 overflow-hidden">
                      <div className="p-4 border-b border-dark-border">
                        <p className="text-xs text-text-muted mb-1">Connected Wallet</p>
                        <p className="font-mono text-sm break-all">{address}</p>
                      </div>
                      <div className="p-4 border-b border-dark-border">
                        <p className="text-xs text-text-muted mb-1">USDCx Balance</p>
                        <p className="text-xl font-bold text-brand-primary">
                          ${formatTokenAmount(usdcxBalance)}
                        </p>
                        <button
                          onClick={() => refreshBalance()}
                          className="text-xs text-text-muted hover:text-white mt-1"
                        >
                          Refresh
                        </button>
                      </div>
                      <div className="p-2">
                        <a
                          href={`https://explorer.hiro.so/address/${address}?chain=testnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-white hover:bg-dark-hover rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View on Explorer
                        </a>
                        <button
                          onClick={handleDisconnect}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-no hover:bg-no/10 rounded-lg transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg font-medium hover:bg-brand-primary/90 transition-colors"
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Connect Wallet</span>
                <span className="sm:hidden">Connect</span>
              </button>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-text-secondary hover:text-white"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-dark-border">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-dark-hover text-white'
                      : 'text-text-secondary hover:text-white hover:bg-dark-hover'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
