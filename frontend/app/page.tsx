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
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-primary/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-brand-secondary/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border rounded-full mb-8">
              <Bitcoin className="w-4 h-4 text-brand-primary" />
              <span className="text-sm text-text-secondary">Built on Stacks - Secured by Bitcoin</span>
            </div>

            {/* Heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-6">
              <span className="gradient-text">Orakamoto</span>
            </h1>
            <p className="text-xl sm:text-2xl text-text-secondary mb-4">
              Decentralized Prediction Markets
            </p>
            <p className="text-lg text-text-muted max-w-2xl mx-auto mb-10">
              Trade on real-world outcomes with AI-powered resolution.
              Your predictions, verified by oracles, secured by Bitcoin.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/markets"
                className="w-full sm:w-auto px-8 py-4 bg-brand-primary text-white rounded-xl font-bold text-lg hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 glow-primary"
              >
                Explore Markets
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/create"
                className="w-full sm:w-auto px-8 py-4 bg-dark-card border border-dark-border text-white rounded-xl font-bold text-lg hover:bg-dark-hover transition-all flex items-center justify-center gap-2"
              >
                Create Market
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-16 max-w-2xl mx-auto">
              <div>
                <p className="text-3xl font-bold text-brand-primary">{markets.length}</p>
                <p className="text-sm text-text-muted">Markets</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-brand-secondary">3-20%</p>
                <p className="text-sm text-text-muted">Exponential Fees</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yes">AI</p>
                <p className="text-sm text-text-muted">Powered Resolution</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Markets */}
      {activeMarkets.length > 0 && (
        <section className="py-16 border-t border-dark-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Active Markets</h2>
              <Link
                href="/markets"
                className="text-brand-primary hover:text-brand-primary/80 flex items-center gap-1"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeMarkets.map((market) => (
                <MarketCard key={market.marketId} market={market} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* What is Orakamoto */}
      <section className="py-20 border-t border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">What is Orakamoto?</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              Orakamoto combines the power of prediction markets with AI-driven oracle resolution,
              all secured by Bitcoin through the Stacks blockchain.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card text-center">
              <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-brand-primary" />
              </div>
              <h3 className="font-semibold mb-2">Prediction Markets</h3>
              <p className="text-sm text-text-muted">
                Trade on the outcome of real-world events. Buy YES or NO tokens based on your predictions.
              </p>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-brand-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Brain className="w-6 h-6 text-brand-secondary" />
              </div>
              <h3 className="font-semibold mb-2">AI Oracle Resolution</h3>
              <p className="text-sm text-text-muted">
                Markets are resolved by AI agents that verify outcomes from multiple data sources.
              </p>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-yes/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-yes" />
              </div>
              <h3 className="font-semibold mb-2">Bitcoin Security</h3>
              <p className="text-sm text-text-muted">
                Built on Stacks, inheriting the security and finality of Bitcoin through proof-of-transfer.
              </p>
            </div>

            <div className="card text-center">
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Coins className="w-6 h-6 text-warning" />
              </div>
              <h3 className="font-semibold mb-2">USDCx Trading</h3>
              <p className="text-sm text-text-muted">
                Trade with USDCx stablecoin for predictable value and easy settlements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 border-t border-dark-border bg-dark-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              Start trading predictions in minutes
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Connect Wallet</h3>
              <p className="text-sm text-text-muted">
                Connect your Hiro or Leather wallet to get started
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">Get USDCx</h3>
              <p className="text-sm text-text-muted">
                Use the testnet faucet to get free USDCx for trading
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Trade Markets</h3>
              <p className="text-sm text-text-muted">
                Buy YES or NO tokens on any active prediction market
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold">
                4
              </div>
              <h3 className="font-semibold mb-2">Claim Winnings</h3>
              <p className="text-sm text-text-muted">
                When the market resolves, claim your USDCx winnings
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              href="/faucet"
              className="inline-flex items-center gap-2 px-6 py-3 bg-dark-hover border border-dark-border rounded-xl hover:bg-dark-card transition-colors"
            >
              <Zap className="w-5 h-5 text-brand-primary" />
              Get Test USDCx
            </Link>
          </div>
        </div>
      </section>

      {/* The Name */}
      <section className="py-20 border-t border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">Why "Orakamoto"?</h2>
          <div className="card">
            <p className="text-lg text-text-secondary mb-4">
              <span className="text-brand-primary font-semibold">Oracle</span> + <span className="text-brand-secondary font-semibold">Nakamoto</span> = <span className="gradient-text font-bold">Orakamoto</span>
            </p>
            <p className="text-text-muted">
              We combine the concept of blockchain oracles (sources of truth that bring real-world data on-chain)
              with Satoshi Nakamoto's vision of decentralized consensus. Our AI-powered oracles resolve markets
              with the same trustless principles that Bitcoin brought to money.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 border-t border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to predict the future?</h2>
          <p className="text-text-secondary mb-8">
            Join Orakamoto and start trading on real-world outcomes today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/markets"
              className="px-8 py-4 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              Start Trading
            </Link>
            <Link
              href="/create"
              className="px-8 py-4 bg-dark-card border border-dark-border rounded-xl font-bold hover:bg-dark-hover transition-all flex items-center gap-2"
            >
              <Users className="w-5 h-5" />
              Create a Market
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
                <span className="text-white font-bold text-sm">O</span>
              </div>
              <span className="font-semibold">Orakamoto</span>
            </div>
            <p className="text-sm text-text-muted">
              Built for Circle xReserve Hackathon 2025
            </p>
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span>Testnet</span>
              <span>|</span>
              <a
                href="https://explorer.hiro.so/?chain=testnet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
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
