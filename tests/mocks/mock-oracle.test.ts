import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('Mock Oracle', () => {
  describe('Price Setting and Retrieval', () => {
    it('should allow admin to set price for an asset', () => {
      const result = simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)], // $50,000 with 8 decimals
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify price was set
      const price = simnet.callReadOnlyFn('mock-oracle', 'get-price',
        [Cl.stringAscii('BTC')],
        wallet1
      );
      expect(price.result).toBeOk(Cl.uint(5000000000));
    });

    it('should reject price setting from non-owner', () => {
      const result = simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(400)); // ERR-NOT-AUTHORIZED
    });

    it('should reject zero price', () => {
      const result = simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(402)); // ERR-ZERO-PRICE
    });

    it('should return error for non-existent asset', () => {
      const result = simnet.callReadOnlyFn('mock-oracle', 'get-price',
        [Cl.stringAscii('NONEXISTENT')],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(401)); // ERR-ASSET-NOT-FOUND
    });

    it('should update price for existing asset', () => {
      // Set initial price
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Update price
      const result = simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5500000000)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify updated price
      const price = simnet.callReadOnlyFn('mock-oracle', 'get-price',
        [Cl.stringAscii('BTC')],
        wallet1
      );
      expect(price.result).toBeOk(Cl.uint(5500000000));
    });
  });

  describe('Price Freshness Check', () => {
    it('should return true for fresh price', () => {
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('BTC'), Cl.uint(1008)], // Max age: 7 days
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for stale price', () => {
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Advance block height by more than max age
      simnet.mineEmptyBlocks(1100);

      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('BTC'), Cl.uint(1008)], // Max age: 7 days
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return error for non-existent asset', () => {
      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('NONEXISTENT'), Cl.uint(1008)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(401)); // ERR-ASSET-NOT-FOUND
    });
  });

  describe('Price Staleness Check', () => {
    it('should return false for fresh price', () => {
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-stale',
        [Cl.stringAscii('BTC')],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return true for stale price', () => {
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Advance block height by more than MAX-PRICE-AGE (1008 blocks)
      simnet.mineEmptyBlocks(1100);

      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-stale',
        [Cl.stringAscii('BTC')],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return error for non-existent asset', () => {
      const result = simnet.callReadOnlyFn('mock-oracle', 'is-price-stale',
        [Cl.stringAscii('NONEXISTENT')],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(401)); // ERR-ASSET-NOT-FOUND
    });
  });

  describe('Set Multiple Prices', () => {
    it('should allow admin to set multiple prices at once', () => {
      const pricesList = Cl.list([
        Cl.tuple({ asset: Cl.stringAscii('BTC'), price: Cl.uint(5000000000) }),
        Cl.tuple({ asset: Cl.stringAscii('ETH'), price: Cl.uint(3000000000) }),
        Cl.tuple({ asset: Cl.stringAscii('STX'), price: Cl.uint(200000000) }),
      ]);

      const result = simnet.callPublicFn('mock-oracle', 'set-prices', [pricesList], deployer);

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify all prices were set
      const btcPrice = simnet.callReadOnlyFn('mock-oracle', 'get-price', [Cl.stringAscii('BTC')], wallet1);
      expect(btcPrice.result).toBeOk(Cl.uint(5000000000));

      const ethPrice = simnet.callReadOnlyFn('mock-oracle', 'get-price', [Cl.stringAscii('ETH')], wallet1);
      expect(ethPrice.result).toBeOk(Cl.uint(3000000000));

      const stxPrice = simnet.callReadOnlyFn('mock-oracle', 'get-price', [Cl.stringAscii('STX')], wallet1);
      expect(stxPrice.result).toBeOk(Cl.uint(200000000));
    });

    it('should reject set-prices from non-owner', () => {
      const pricesList = Cl.list([
        Cl.tuple({ asset: Cl.stringAscii('BTC'), price: Cl.uint(5000000000) }),
      ]);

      const result = simnet.callPublicFn('mock-oracle', 'set-prices', [pricesList], wallet1);

      expect(result.result).toBeErr(Cl.uint(400)); // ERR-NOT-AUTHORIZED
    });
  });

  describe('Remove Price', () => {
    it('should allow admin to remove an asset', () => {
      // Set price first
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Verify price exists
      let price = simnet.callReadOnlyFn('mock-oracle', 'get-price', [Cl.stringAscii('BTC')], wallet1);
      expect(price.result).toBeOk(Cl.uint(5000000000));

      // Remove price
      const result = simnet.callPublicFn('mock-oracle', 'remove-price',
        [Cl.stringAscii('BTC')],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify price no longer exists
      price = simnet.callReadOnlyFn('mock-oracle', 'get-price', [Cl.stringAscii('BTC')], wallet1);
      expect(price.result).toBeErr(Cl.uint(401)); // ERR-ASSET-NOT-FOUND
    });

    it('should reject remove-price from non-owner', () => {
      const result = simnet.callPublicFn('mock-oracle', 'remove-price',
        [Cl.stringAscii('BTC')],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(400)); // ERR-NOT-AUTHORIZED
    });
  });

  describe('Get Price Info', () => {
    it('should return price and timestamp for existing asset', () => {
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      const result = simnet.callReadOnlyFn('mock-oracle', 'get-price-info',
        [Cl.stringAscii('BTC')],
        wallet1
      );

      const info = (result.result as any).value.value;
      // Verify price is correct
      expect(info.price.value).toBe(5000000000n);
      // Verify timestamp is set (should be > 0)
      expect(info.timestamp.value).toBeGreaterThan(0);
    });

    it('should return error for non-existent asset', () => {
      const result = simnet.callReadOnlyFn('mock-oracle', 'get-price-info',
        [Cl.stringAscii('NONEXISTENT')],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(401)); // ERR-ASSET-NOT-FOUND
    });
  });

  describe('Integration Tests', () => {
    it('should handle price updates over time', () => {
      // Initial price
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      let priceInfo = simnet.callReadOnlyFn('mock-oracle', 'get-price-info',
        [Cl.stringAscii('BTC')],
        wallet1
      );
      let info = (priceInfo.result as any).value.value;
      const initialBlock = info.timestamp.value;

      // Mine some blocks
      simnet.mineEmptyBlocks(100);

      // Update price
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5500000000)],
        deployer
      );

      priceInfo = simnet.callReadOnlyFn('mock-oracle', 'get-price-info',
        [Cl.stringAscii('BTC')],
        wallet1
      );
      info = (priceInfo.result as any).value.value;
      const updatedBlock = info.timestamp.value;

      // Verify price changed
      expect(info.price.value).toBe(5500000000n);
      // Verify timestamp updated
      expect(updatedBlock).toBeGreaterThan(initialBlock);
    });

    it('should handle multiple assets independently', () => {
      // Set prices for multiple assets
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('ETH'), Cl.uint(3000000000)],
        deployer
      );

      // Update only BTC
      simnet.mineEmptyBlocks(50);
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5200000000)],
        deployer
      );

      // Check BTC is fresh, ETH is stale
      const btcFresh = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('BTC'), Cl.uint(1008)],
        wallet1
      );
      expect(btcFresh.result).toBeOk(Cl.bool(true));

      const ethFresh = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('ETH'), Cl.uint(1008)],
        wallet1
      );
      expect(ethFresh.result).toBeOk(Cl.bool(true)); // Still fresh (50 blocks < 1008)

      // Mine enough blocks to make ETH stale
      simnet.mineEmptyBlocks(1000);

      const ethStale = simnet.callReadOnlyFn('mock-oracle', 'is-price-fresh',
        [Cl.stringAscii('ETH'), Cl.uint(1008)],
        wallet1
      );
      expect(ethStale.result).toBeOk(Cl.bool(false));
    });
  });
});
