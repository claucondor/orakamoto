import { create } from 'zustand';
import { AppConfig, UserSession } from '@stacks/connect';
import { getUSDCxBalance, getFaucetRemaining, getAllMarkets, getUserPosition, getCurrentBlockHeight } from './contracts';
import type { Market, UserPosition } from './contracts';

// App config for wallet connection
const appConfig = new AppConfig(['store_write', 'publish_data']);
export const userSession = new UserSession({ appConfig });

// Wallet store
interface WalletState {
  address: string | null;
  isConnected: boolean;
  usdcxBalance: bigint;
  faucetRemaining: bigint;
  isLoading: boolean;

  // Actions
  setAddress: (address: string | null) => void;
  refreshBalance: () => Promise<void>;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  isConnected: false,
  usdcxBalance: BigInt(0),
  faucetRemaining: BigInt(0),
  isLoading: false,

  setAddress: (address) => {
    set({ address, isConnected: !!address });
    if (address) {
      get().refreshBalance();
    }
  },

  refreshBalance: async () => {
    const { address } = get();
    if (!address) return;

    set({ isLoading: true });
    try {
      const [usdcxBalance, faucetRemaining] = await Promise.all([
        getUSDCxBalance(address),
        getFaucetRemaining(address),
      ]);
      set({ usdcxBalance, faucetRemaining, isLoading: false });
    } catch (error) {
      console.error('Error refreshing balance:', error);
      set({ isLoading: false });
    }
  },

  disconnect: () => {
    userSession.signUserOut();
    set({
      address: null,
      isConnected: false,
      usdcxBalance: BigInt(0),
      faucetRemaining: BigInt(0),
    });
  },
}));

// Markets store
interface MarketsState {
  markets: Market[];
  isLoading: boolean;
  currentBlockHeight: number;
  error: string | null;

  // Selected market for detail view
  selectedMarket: Market | null;
  selectedMarketPrices: { yesPrice: number; noPrice: number } | null;

  // Actions
  fetchMarkets: () => Promise<void>;
  fetchBlockHeight: () => Promise<void>;
  setSelectedMarket: (market: Market | null) => void;
}

export const useMarketsStore = create<MarketsState>((set) => ({
  markets: [],
  isLoading: false,
  currentBlockHeight: 0,
  error: null,
  selectedMarket: null,
  selectedMarketPrices: null,

  fetchMarkets: async () => {
    set({ isLoading: true, error: null });
    try {
      const markets = await getAllMarkets();
      // Sort by newest first
      markets.sort((a, b) => b.createdAt - a.createdAt);
      set({ markets, isLoading: false });
    } catch (error) {
      console.error('Error fetching markets:', error);
      set({ error: 'Failed to load markets', isLoading: false });
    }
  },

  fetchBlockHeight: async () => {
    try {
      const height = await getCurrentBlockHeight();
      set({ currentBlockHeight: height });
    } catch (error) {
      console.error('Error fetching block height:', error);
    }
  },

  setSelectedMarket: (market) => {
    set({ selectedMarket: market });
  },
}));

// User positions store
interface PositionsState {
  positions: Map<number, UserPosition>;
  isLoading: boolean;

  // Actions
  fetchPosition: (marketId: number, address: string) => Promise<UserPosition | null>;
  clearPositions: () => void;
}

export const usePositionsStore = create<PositionsState>((set, get) => ({
  positions: new Map(),
  isLoading: false,

  fetchPosition: async (marketId, address) => {
    set({ isLoading: true });
    try {
      const position = await getUserPosition(marketId, address);
      const { positions } = get();
      const newPositions = new Map(positions);
      newPositions.set(marketId, position);
      set({ positions: newPositions, isLoading: false });
      return position;
    } catch (error) {
      console.error('Error fetching position:', error);
      set({ isLoading: false });
      return null;
    }
  },

  clearPositions: () => {
    set({ positions: new Map() });
  },
}));

// Transaction store for tracking pending transactions
interface TxState {
  pendingTx: string | null;
  txStatus: 'pending' | 'success' | 'error' | null;
  txMessage: string | null;

  // Actions
  setPendingTx: (txId: string) => void;
  setTxSuccess: (message?: string) => void;
  setTxError: (message: string) => void;
  clearTx: () => void;
}

export const useTxStore = create<TxState>((set) => ({
  pendingTx: null,
  txStatus: null,
  txMessage: null,

  setPendingTx: (txId) => {
    set({ pendingTx: txId, txStatus: 'pending', txMessage: 'Transaction submitted...' });
  },

  setTxSuccess: (message = 'Transaction successful!') => {
    set({ txStatus: 'success', txMessage: message });
  },

  setTxError: (message) => {
    set({ txStatus: 'error', txMessage: message });
  },

  clearTx: () => {
    set({ pendingTx: null, txStatus: null, txMessage: null });
  },
}));
