'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { showConnect } from '@stacks/connect';
import { useWalletStore, userSession } from '@/lib/store';
import { formatAddress, formatTokenAmount } from '@/lib/constants';
import { Menu, X, Wallet, ChevronDown, LogOut, ExternalLink } from 'lucide-react';
import MarketSearch from '@/components/markets/MarketSearch';
import StatsTicker from '@/components/layout/StatsTicker';

const navigation = [
  { name: '> markets', href: '/markets' },
  { name: '> create', href: '/create' },
  { name: '> bridge', href: '/bridge' },
  { name: '> portfolio', href: '/portfolio' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // If on markets page, the search will be handled there
    // If not, we could redirect to markets page with search query
    if (pathname !== '/markets' && query) {
      window.location.href = `/markets?search=${encodeURIComponent(query)}`;
    }
  };

  if (!mounted) return null;

  return (
    <>
      <header className="sticky top-0 z-50 bg-void-black/95 backdrop-blur-xl border-b-2 border-matrix-green">
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Top row: Logo, Navigation, Wallet */}
          <div className="flex h-20 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 border-2 border-btc-orange flex items-center justify-center">
                  <span className="text-btc-orange font-bold text-lg">O</span>
                </div>
                <span className="text-xl font-bold neon-text-orange hidden sm:block font-mono">
                  ORAKAMOTO
                </span>
              </Link>
            </div>

            {/* Desktop Navigation - Terminal Style */}
            <div className="hidden md:flex items-center gap-2">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-6 py-3 text-base font-semibold transition-colors font-mono ${
                    pathname === item.href
                      ? 'text-matrix-green border-b-2 border-matrix-green'
                      : 'text-text-secondary hover:text-matrix-green hover:border-b-2 hover:border-matrix-green/50'
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
                    className="flex items-center gap-4 px-6 py-3 bg-terminal-bg border-2 border-matrix-green hover:border-cyber-cyan transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-matrix-green animate-pulse flicker"></div>
                      <span className="text-base font-semibold font-mono">{formatAddress(address)}</span>
                    </div>
                    <div className="h-4 w-px bg-dark-border"></div>
                    <span className="text-base text-btc-orange font-semibold font-mono">
                      ${formatTokenAmount(usdcxBalance)}
                    </span>
                    <ChevronDown className="w-5 h-5 text-text-secondary" />
                  </button>

                  {/* Wallet Dropdown - Brutalist Style */}
                  {walletMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setWalletMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-72 bg-terminal-bg border-2 border-matrix-green shadow-xl z-20 overflow-hidden">
                        <div className="p-6 border-b-2 border-matrix-green">
                          <p className="text-sm text-text-secondary mb-2 font-mono">&gt; CONNECTED_WALLET</p>
                          <p className="font-mono text-base break-all text-matrix-green">{address}</p>
                        </div>
                        <div className="p-6 border-b-2 border-matrix-green">
                          <p className="text-sm text-text-secondary mb-2 font-mono">&gt; USDCx_BALANCE</p>
                          <p className="text-2xl font-bold text-btc-orange font-mono">
                            ${formatTokenAmount(usdcxBalance)}
                          </p>
                          <button
                            onClick={() => refreshBalance()}
                            className="text-sm text-cyber-cyan hover:text-white mt-2 font-mono font-semibold"
                          >
                            [REFRESH]
                          </button>
                        </div>
                        <div className="p-2">
                          <a
                            href={`https://explorer.hiro.so/address/${address}?chain=testnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 w-full px-4 py-3 text-base text-text-secondary hover:text-matrix-green hover:bg-matrix-green/5 font-mono"
                          >
                            <ExternalLink className="w-5 h-5" />
                            VIEW_ON_EXPLORER
                          </a>
                          <button
                            onClick={handleDisconnect}
                            className="flex items-center gap-3 w-full px-4 py-3 text-base text-cyber-magenta hover:bg-cyber-magenta/5 font-mono"
                          >
                            <LogOut className="w-5 h-5" />
                            DISCONNECT
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  className="brutalist-button text-base px-8 py-4"
                >
                  <Wallet className="w-5 h-5 mr-2" />
                  CONNECT
                </button>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-matrix-green hover:text-cyber-cyan"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Search Bar (separate row) */}
          <div className="pb-6">
            <MarketSearch
              onSearch={handleSearch}
              placeholder="&gt; Search markets by question, category, or ID..."
            />
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-6 border-t-2 border-matrix-green">
              <div className="flex flex-col gap-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-6 py-4 text-base font-semibold transition-colors font-mono ${
                      pathname === item.href
                        ? 'text-matrix-green border-l-2 border-matrix-green bg-matrix-green/5'
                        : 'text-text-secondary hover:text-matrix-green hover:border-l-2 hover:border-matrix-green/50'
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

      {/* Stats Ticker - Terminal Style */}
      <div className="border-b-2 border-dark-border bg-terminal-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <StatsTicker />
        </div>
      </div>
    </>
  );
}
