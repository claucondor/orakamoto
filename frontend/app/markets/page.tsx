'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMarketsStore } from '@/lib/store';
import MarketCard from '@/components/MarketCard';
import CategoryNav from '@/components/markets/CategoryNav';
import MarketSearch from '@/components/markets/MarketSearch';
import ViewToggle from '@/components/ui/ViewToggle';
import SortDropdown, { SortOption } from '@/components/ui/SortDropdown';
import { MarketCardSkeleton } from '@/components/feedback/LoadingSkeleton';
import { Plus, TrendingUp } from 'lucide-react';

type ViewType = 'grid' | 'list';

export default function MarketsPage() {
  const { markets, isLoading, fetchMarkets, fetchBlockHeight, currentBlockHeight } = useMarketsStore();
  const [mounted, setMounted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('volume');
  const [viewType, setViewType] = useState<ViewType>('grid');

  useEffect(() => {
    setMounted(true);
    fetchMarkets();
    fetchBlockHeight();
  }, [fetchMarkets, fetchBlockHeight]);

  // Handle URL search params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get('search');
      if (searchParam) {
        setSearchQuery(searchParam);
      }
    }
  }, []);

  if (!mounted) return null;

  // Filter and sort markets
  const filteredMarkets = markets
    .filter((market) => {
      // Search filter
      if (searchQuery && !market.question.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Category filter (mock implementation - in production this would use market metadata)
      if (selectedCategory !== 'all') {
        const categoryMap: Record<number, string> = {
          0: 'crypto',
          1: 'politics',
          2: 'sports',
          3: 'tech',
          4: 'ai',
        };
        const marketCategory = categoryMap[market.marketId % 5] || 'crypto';
        if (marketCategory !== selectedCategory) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      // Sort markets
      switch (sortBy) {
        case 'volume':
          // Sort by liquidity as proxy for volume
          return Number(b.totalLiquidity - a.totalLiquidity);
        case 'liquidity':
          return Number(b.totalLiquidity - a.totalLiquidity);
        case 'ending-soon':
          return a.deadline - b.deadline;
        case 'newest':
          return b.marketId - a.marketId;
        default:
          return 0;
      }
    });

  return (
    <main className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-bold mb-3">Prediction Markets</h1>
            <p className="text-text-secondary text-lg">
              Browse and trade on {markets.length} prediction markets
            </p>
          </div>
          <Link
            href="/create"
            className="flex items-center justify-center gap-3 px-10 py-5 btn-gradient hover-scale gpu-accelerated text-base font-semibold"
          >
            <Plus className="w-6 h-6" />
            Create Market
          </Link>
        </div>

        {/* Category Navigation */}
        <div className="mb-8">
          <CategoryNav
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Search and Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-12">
          {/* Search */}
          <div className="flex-1">
            <MarketSearch
              onSearch={setSearchQuery}
              placeholder="Search markets by question, category, or ID..."
            />
          </div>

          {/* Sort and View Toggle */}
          <div className="flex items-center gap-3">
            <SortDropdown value={sortBy} onChange={setSortBy} />
            <ViewToggle currentView={viewType} onViewChange={setViewType} />
          </div>
        </div>

        {/* Markets Grid */}
        {isLoading ? (
          <div className={viewType === 'grid' ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-8' : 'flex flex-col gap-6'}>
            <MarketCardSkeleton count={viewType === 'grid' ? 6 : 5} />
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-dark-card flex items-center justify-center mx-auto mb-6">
              <TrendingUp className="w-10 h-10 text-text-secondary" />
            </div>
            <h3 className="text-2xl font-bold mb-3">No markets found</h3>
            <p className="text-text-secondary mb-8 text-lg">
              {searchQuery
                ? 'Try a different search term'
                : selectedCategory !== 'all'
                ? 'No markets in this category'
                : 'Be the first to create a prediction market'}
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-3 px-10 py-5 btn-gradient hover-scale gpu-accelerated text-base font-semibold"
            >
              <Plus className="w-6 h-6" />
              Create Market
            </Link>
          </div>
        ) : (
          <div
            className={
              viewType === 'grid'
                ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-8'
                : 'flex flex-col gap-6'
            }
          >
            {filteredMarkets.map((market) => (
              <MarketCard key={market.marketId} market={market} />
            ))}
          </div>
        )}

        {/* Refresh Button */}
        <div className="text-center mt-12">
          <button
            onClick={() => {
              fetchMarkets();
              fetchBlockHeight();
            }}
            disabled={isLoading}
            className="text-base text-text-secondary hover:text-white transition-colors px-6 py-3 hover:bg-dark-hover font-mono"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Markets'}
          </button>
        </div>
      </div>
    </main>
  );
}
