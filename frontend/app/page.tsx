'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMarketsStore, useWalletStore } from '@/lib/store';
import MarketCard from '@/components/MarketCard';
import {
  ArrowRight,
  Zap,
  Shield,
  Brain,
  TrendingUp,
  Users,
  Coins,
  ChevronRight,
  Bitcoin,
} from 'lucide-react';

export default function Home() {
  const { markets, isLoading, fetchMarkets, fetchBlockHeight } = useMarketsStore();
  const { isConnected } = useWalletStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchMarkets();
    fetchBlockHeight();
  }, [fetchMarkets, fetchBlockHeight]);

  // Get top 3 active markets
  const activeMarkets = markets
    .filter(m => !m.isResolved)
    .slice(0, 3);

  if (!mounted) return null;

  return (
    <main className="min-h-screen font-mono">
      {/* Terminal Hero Section */}
      <section className="matrix-bg crt-screen min-h-screen flex items-center justify-center relative overflow-hidden py-20 lg:py-32">
        {/* ASCII Art Bitcoin Logo */}
        <div className="absolute top-10 left-10 opacity-20 font-mono text-xs leading-tight text-matrix-green hidden sm:block">
          <pre className="text-matrix-green">
{`
      .---.
     /     \\
    |() () |
     \\  ^  /
      |||||
     '.___.'
    ₿ ORAKAMOTO
`}
          </pre>
        </div>

        {/* Terminal Window */}
        <div className="max-w-4xl w-full mx-4">
          <div className="terminal-window shadow-2xl">
            {/* Terminal Header */}
            <div className="terminal-header">
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-matrix-green"></div>
                <div className="w-3 h-3 bg-cyber-yellow"></div>
                <div className="w-3 h-3 bg-cyber-magenta"></div>
              </div>
              <span className="font-mono text-sm text-matrix-green ml-4">
                root@orakamoto:~$ ./start-trading.sh
              </span>
            </div>

            {/* Terminal Content */}
            <div className="terminal-content">
              <div className="text-matrix-green mb-10 text-sm flicker">
                <span className="text-matrix-dark">$</span> Loading prediction markets...
                <span className="animate-pulse">_</span>
              </div>

              <h1 className="text-6xl md:text-8xl font-bold mb-6 neon-text-orange glitch-text">
                ORAKAMOTO
              </h1>

              <p className="text-matrix-green mb-4 text-xl neon-text-green">
                &gt; Decentralized Prediction Markets
              </p>
              <p className="text-text-secondary mb-10 text-base">
                &gt; Trade on future outcomes. Secured by Bitcoin.
              </p>

              {/* Badge */}
              <div className="inline-flex items-center gap-3 mb-10 terminal-badge terminal-badge-orange">
                <Bitcoin className="w-5 h-5" />
                <span className="text-base">Built on Stacks - Secured by Bitcoin</span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 mb-10 border-2 border-matrix-green/30 p-6 bg-matrix-green/5 holographic">
                <div className="text-center">
                  <div className="text-3xl font-bold text-matrix-green pulse-ring">{markets.length}</div>
                  <div className="text-sm text-text-secondary mt-2">ACTIVE MARKETS</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyber-cyan">3-20%</div>
                  <div className="text-sm text-text-secondary mt-2">LP FEES</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-btc-orange">BTC</div>
                  <div className="text-sm text-text-secondary mt-2">SECURED</div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-6">
                <Link href="/markets" className="glitch-button" data-text="EXPLORE_MARKETS">
                  EXPLORE_MARKETS_
                </Link>
                <Link href="/create" className="brutalist-button">
                  CREATE_MARKET_
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Markets */}
      {activeMarkets.length > 0 && (
        <section className="section-spacing border-t-2 border-dark-border bg-void-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-bold neon-text-cyan">
                &gt; ACTIVE_MARKETS
              </h2>
              <Link
                href="/markets"
                className="text-btc-orange hover:text-btc-dark flex items-center gap-1 font-mono text-sm"
              >
                VIEW_ALL_
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {activeMarkets.map((market) => (
                <MarketCard key={market.marketId} market={market} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* What is Orakamoto */}
      <section className="section-spacing border-t-2 border-dark-border bg-void-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-6 neon-text-green">WHAT_IS_ORAKAMOTO?</h2>
            <p className="text-text-secondary max-w-3xl mx-auto font-mono text-lg leading-relaxed">
              &gt; Orakamoto combines the power of prediction markets with AI-driven oracle resolution,
              all secured by Bitcoin through the Stacks blockchain.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="brutalist-card card-spacing text-center noise-texture">
              <div className="w-16 h-16 border-2 border-btc-orange flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-8 h-8 text-btc-orange" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-btc-orange">PREDICTION_MARKETS</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Trade on the outcome of real-world events. Buy YES or NO tokens based on your predictions.
              </p>
            </div>

            <div className="brutalist-card card-spacing text-center noise-texture">
              <div className="w-16 h-16 border-2 border-cyber-cyan flex items-center justify-center mx-auto mb-6">
                <Brain className="w-8 h-8 text-cyber-cyan" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-cyber-cyan">AI_ORACLE_RESOLUTION</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Markets are resolved by AI agents that verify outcomes from multiple data sources.
              </p>
            </div>

            <div className="brutalist-card card-spacing text-center noise-texture">
              <div className="w-16 h-16 border-2 border-matrix-green flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-matrix-green" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-matrix-green">BITCOIN_SECURITY</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Built on Stacks, inheriting the security and finality of Bitcoin through proof-of-transfer.
              </p>
            </div>

            <div className="brutalist-card card-spacing text-center noise-texture">
              <div className="w-16 h-16 border-2 border-cyber-yellow flex items-center justify-center mx-auto mb-6">
                <Coins className="w-8 h-8 text-cyber-yellow" />
              </div>
              <h3 className="text-xl font-bold mb-4 text-cyber-yellow">USDCx_TRADING</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Trade with USDCx stablecoin for predictable value and easy settlements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="section-spacing border-t-2 border-dark-border bg-terminal-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-6 neon-text-cyan">HOW_IT_WORKS</h2>
            <p className="text-text-secondary max-w-2xl mx-auto font-mono text-lg">
              &gt; Start trading predictions in minutes
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 border-2 border-btc-orange flex items-center justify-center mx-auto mb-6 text-btc-orange font-bold text-2xl">
                1
              </div>
              <h3 className="text-xl font-bold mb-4 text-btc-orange">CONNECT_WALLET</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Connect your Hiro or Leather wallet to get started
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 border-2 border-btc-orange flex items-center justify-center mx-auto mb-6 text-btc-orange font-bold text-2xl">
                2
              </div>
              <h3 className="text-xl font-bold mb-4 text-btc-orange">GET_USDCx</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Get USDCx — Circle's official USDC on Stacks — to use as collateral
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 border-2 border-btc-orange flex items-center justify-center mx-auto mb-6 text-btc-orange font-bold text-2xl">
                3
              </div>
              <h3 className="text-xl font-bold mb-4 text-btc-orange">TRADE_MARKETS</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                Buy YES or NO tokens on any active prediction market
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 border-2 border-btc-orange flex items-center justify-center mx-auto mb-6 text-btc-orange font-bold text-2xl">
                4
              </div>
              <h3 className="text-xl font-bold mb-4 text-btc-orange">CLAIM_WINNINGS</h3>
              <p className="text-base text-text-secondary font-mono leading-relaxed">
                When the market resolves, claim your USDCx winnings
              </p>
            </div>
          </div>

          <div className="text-center mt-16">
            <Link
              href="/markets"
              className="terminal-button"
            >
              <Zap className="w-5 h-5 mr-2" />
              EXPLORE_MARKETS
            </Link>
          </div>
        </div>
      </section>

      {/* The Name */}
      <section className="section-spacing border-t-2 border-dark-border bg-void-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-8 neon-text-magenta">WHY_ORAKAMOTO?</h2>
          <div className="card border-2 border-cyber-magenta card-spacing">
            <p className="text-xl text-text-secondary mb-6 font-mono leading-relaxed">
              <span className="text-btc-orange font-bold">Oracle</span> + <span className="text-brand-secondary font-bold">Nakamoto</span> = <span className="gradient-text font-bold">Orakamoto</span>
            </p>
            <p className="text-text-secondary font-mono text-lg leading-relaxed">
              &gt; We combine the concept of blockchain oracles (sources of truth that bring real-world data on-chain)
              with Satoshi Nakamoto's vision of decentralized consensus. Our AI-powered oracles resolve markets
              with the same trustless principles that Bitcoin brought to money.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-spacing border-t-2 border-dark-border bg-void-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6 neon-text-green">READY_TO_PREDICT_THE_FUTURE?</h2>
          <p className="text-text-secondary mb-12 font-mono text-lg">
            &gt; Join Orakamoto and start trading on real-world outcomes today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              href="/markets"
              className="glitch-button"
              data-text="START_TRADING"
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              START_TRADING
            </Link>
            <Link
              href="/create"
              className="brutalist-button"
            >
              <Users className="w-5 h-5 mr-2" />
              CREATE_MARKET
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-dark-border bg-terminal-bg py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-btc-orange flex items-center justify-center">
                <span className="text-btc-orange font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold">Orakamoto</span>
            </div>
            <p className="text-base text-text-secondary font-mono">
              Built on Bitcoin. Powered by USDCx.
            </p>
            <div className="flex items-center gap-6 text-base text-text-secondary font-mono">
              <span>Testnet</span>
              <span>|</span>
              <a
                href="https://explorer.hiro.so/?chain=testnet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-matrix-green transition-colors"
              >
                Explorer
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
