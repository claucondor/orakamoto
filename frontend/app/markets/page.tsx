'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMarketsStore } from '@/lib/store';
import MarketCard from '@/components/MarketCard';
import { Search, Filter, Loader2, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';

type FilterType = 'all' | 'active' | 'ended' | 'resolved';

export default function MarketsPage() {
  const { markets, isLoading, fetchMarkets, fetchBlockHeight, currentBlockHeight } = useMarketsStore();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMounted(true);
    fetchMarkets();
    fetchBlockHeight();
  }, [fetchMarkets, fetchBlockHeight]);

  if (!mounted) return null;

  // Filter markets
  const filteredMarkets = markets.filter((market) => {
    // Search filter
    if (search && !market.question.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    // Status filter
    switch (filter) {
      case 'active':
        return !market.isResolved && currentBlockHeight < market.deadline;
      case 'ended':
        return !market.isResolved && currentBlockHeight >= market.deadline;
      case 'resolved':
        return market.isResolved;
      default:
        return true;
    }
  });

  // Count by status
  const activeCount = markets.filter(m => !m.isResolved && currentBlockHeight < m.deadline).length;
  const endedCount = markets.filter(m => !m.isResolved && currentBlockHeight >= m.deadline).length;
  const resolvedCount = markets.filter(m => m.isResolved).length;

  return (
    <main className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Prediction Markets</h1>
            <p className="text-text-muted">
              Browse and trade on {markets.length} prediction markets
            </p>
          </div>
          <Link
            href="/create"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all"
          >
            <Plus className="w-5 h-5" />
            Create Market
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-12"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 p-1 bg-dark-card rounded-xl border border-dark-border">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-brand-primary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              All ({markets.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'active'
                  ? 'bg-yes text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilter('ended')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'ended'
                  ? 'bg-warning text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              Ended ({endedCount})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'resolved'
                  ? 'bg-brand-secondary text-white'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              Resolved ({resolvedCount})
            </button>
          </div>
        </div>

        {/* Markets Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
            <p className="text-text-muted">Loading markets...</p>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-dark-card rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No markets found</h3>
            <p className="text-text-muted mb-6">
              {search
                ? 'Try a different search term'
                : filter !== 'all'
                ? 'No markets in this category'
                : 'Be the first to create a prediction market'}
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all"
            >
              <Plus className="w-5 h-5" />
              Create Market
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.marketId} market={market} />
            ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
              fetchMarkets();
              fetchBlockHeight();
            }}
            disabled={isLoading}
            className="text-sm text-text-muted hover:text-white transition-colors"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Markets'}
          </button>
        </div>
      </div>
    </main>
  );
}
