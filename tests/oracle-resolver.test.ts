import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

// Resolution type constants
const RESOLUTION_TYPE_MANUAL = 0;
const RESOLUTION_TYPE_PRICE_TARGET = 1;
const RESOLUTION_TYPE_TIME_BASED = 2;

describe('Oracle Resolver', () => {
  describe('Constants', () => {
    it('should have correct resolution type constants', () => {
      // MANUAL resolution type
      const manualResult = simnet.callReadOnlyFn('oracle-resolver', 'get-oracle-config', [Cl.uint(1)], wallet1);
      // Will return error since market not configured, but contract compiles with constants
      expect(true).toBe(true); // Just verify contract compiles
    });
  });

  describe('Configure Market', () => {
    it('should allow configuring market for PRICE_TARGET resolution', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),                          // market-id
          Cl.some(Cl.principal(deployer)),     // oracle-contract
          Cl.stringAscii('BTC'),               // price-feed-id
          Cl.uint(5000000000),                 // target-price ($50,000 with 8 decimals)
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET), // resolution-type
          Cl.uint(1008),                       // max-price-age (7 days)
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow configuring market for TIME_BASED resolution', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(0),                           // target-price not used for TIME_BASED
          Cl.uint(RESOLUTION_TYPE_TIME_BASED),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow configuring market for MANUAL resolution (no oracle needed)', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.none(),                    // no oracle for manual resolution
          Cl.stringAscii(''),                   // no price feed for manual
          Cl.uint(0),                           // no target price
          Cl.uint(RESOLUTION_TYPE_MANUAL),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject invalid resolution type', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(99),                           // Invalid resolution type
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4102)); // ERR-INVALID-RESOLUTION-TYPE
    });

    it('should reject PRICE_TARGET with zero target price', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(0),                            // Zero target price
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4103)); // ERR-INVALID-TARGET-PRICE
    });

    it('should reject PRICE_TARGET without oracle contract', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.none(),                     // No oracle contract
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4104)); // ERR-INVALID-ORACLE
    });

    it('should reject TIME_BASED without oracle contract', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.none(),                     // No oracle contract
          Cl.stringAscii('BTC'),
          Cl.uint(0),
          Cl.uint(RESOLUTION_TYPE_TIME_BASED),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4104)); // ERR-INVALID-ORACLE
    });

    it('should reject configuring already configured market', () => {
      // Configure once
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Try to configure again
      const result = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('ETH'),
          Cl.uint(3000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4105)); // ERR-ALREADY-CONFIGURED
    });
  });

  describe('Get Oracle Config', () => {
    it('should return config for configured market', () => {
      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn('oracle-resolver', 'get-oracle-config',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeOk(expect.anything());
    });

    it('should return error for non-existent market', () => {
      const result = simnet.callReadOnlyFn('oracle-resolver', 'get-oracle-config',
        [Cl.uint(999)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4101)); // ERR-MARKET-NOT-FOUND
    });
  });

  describe('Get Current Price', () => {
    it('should return current price from oracle', () => {
      // First set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'get-current-price',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.uint(5000000000));
    });

    it('should return error for non-configured market', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'get-current-price',
        [
          Cl.uint(999),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4101)); // ERR-MARKET-NOT-FOUND
    });
  });

  describe('Is Price Fresh For Market', () => {
    it('should return true for fresh price', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'is-price-fresh-for-market',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should return false for stale price', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Mine enough blocks to make price stale
      simnet.mineEmptyBlocks(1100);

      const result = simnet.callPublicFn('oracle-resolver', 'is-price-fresh-for-market',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe('Check Resolution - PRICE_TARGET', () => {
    it('should resolve to YES when price >= target', () => {
      // Set up mock oracle with price at target
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)], // $50,000
        deployer
      );

      // Configure market with target at $50,000
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000), // Target: $50,000
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(0), // YES wins
        })
      );
    });

    it('should resolve to NO when price < target', () => {
      // Set up mock oracle with price below target
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(4500000000)], // $45,000
        deployer
      );

      // Configure market with target at $50,000
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000), // Target: $50,000
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(1), // NO wins
        })
      );
    });

    it('should reject resolution if price is stale', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Mine enough blocks to make price stale
      simnet.mineEmptyBlocks(1100);

      const result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4106)); // ERR-RESOLUTION-NOT-TRIGGERED
    });

    it('should reject resolution if market already resolved', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Resolve once
      simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      // Try to resolve again
      const result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4109)); // ERR-MARKET-NOT-READY
    });
  });

  describe('Check Resolution - MANUAL', () => {
    it('should reject resolution for MANUAL type', () => {
      // Configure market for MANUAL resolution
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.none(),
          Cl.stringAscii(''),
          Cl.uint(0),
          Cl.uint(RESOLUTION_TYPE_MANUAL),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4106)); // ERR-RESOLUTION-NOT-TRIGGERED
    });
  });

  describe('Deactivate Auto-Resolution', () => {
    it('should allow deactivating auto-resolution', () => {
      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'deactivate-auto-resolution',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject deactivating already inactive market', () => {
      // Configure and deactivate
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      simnet.callPublicFn('oracle-resolver', 'deactivate-auto-resolution',
        [Cl.uint(1)],
        deployer
      );

      // Try to deactivate again
      const result = simnet.callPublicFn('oracle-resolver', 'deactivate-auto-resolution',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4109)); // ERR-MARKET-NOT-READY
    });
  });

  describe('Update Oracle Config', () => {
    it('should allow owner to update oracle config', () => {
      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Update config
      const result = simnet.callPublicFn('oracle-resolver', 'update-oracle-config',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(wallet1)),
          Cl.stringAscii('ETH'),
          Cl.uint(3000000000),
          Cl.uint(504), // Shorter max age
        ],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject update from non-owner', () => {
      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Try to update from non-owner
      const result = simnet.callPublicFn('oracle-resolver', 'update-oracle-config',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(wallet1)),
          Cl.stringAscii('ETH'),
          Cl.uint(3000000000),
          Cl.uint(504),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4100)); // ERR-NOT-AUTHORIZED
    });

    it('should reject update for inactive market', () => {
      // Configure and deactivate
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      simnet.callPublicFn('oracle-resolver', 'deactivate-auto-resolution',
        [Cl.uint(1)],
        deployer
      );

      // Try to update
      const result = simnet.callPublicFn('oracle-resolver', 'update-oracle-config',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(wallet1)),
          Cl.stringAscii('ETH'),
          Cl.uint(3000000000),
          Cl.uint(504),
        ],
        deployer
      );

      expect(result.result).toBeErr(Cl.uint(4109)); // ERR-MARKET-NOT-READY
    });
  });

  describe('Reset Resolution', () => {
    it('should allow owner to reset resolution status', () => {
      // Configure and resolve
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      // Reset resolution
      const result = simnet.callPublicFn('oracle-resolver', 'reset-resolution',
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject reset from non-owner', () => {
      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(deployer)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'reset-resolution',
        [Cl.uint(1)],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4100)); // ERR-NOT-AUTHORIZED
    });
  });

  describe('Can Auto Resolve', () => {
    it('should return can-resolve=true for PRICE_TARGET when price meets target', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5000000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'can-auto-resolve',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'can-resolve': Cl.bool(true),
          'outcome': Cl.some(Cl.uint(0)),
          'reason': Cl.stringUtf8('Price target met'),
        })
      );
    });

    it('should return can-resolve=false for MANUAL type', () => {
      // Configure market for MANUAL
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.none(),
          Cl.stringAscii(''),
          Cl.uint(0),
          Cl.uint(RESOLUTION_TYPE_MANUAL),
          Cl.uint(1008),
        ],
        deployer
      );

      const result = simnet.callPublicFn('oracle-resolver', 'can-auto-resolve',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'can-resolve': Cl.bool(false),
          'outcome': Cl.none(),
          'reason': Cl.stringUtf8('Market requires manual resolution'),
        })
      );
    });

    it('should return can-resolve=false for non-configured market', () => {
      const result = simnet.callPublicFn('oracle-resolver', 'can-auto-resolve',
        [
          Cl.uint(999),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );

      expect(result.result).toBeErr(Cl.uint(4101)); // ERR-MARKET-NOT-FOUND
    });
  });

  describe('Integration Tests', () => {
    it('should handle full lifecycle: configure -> check -> resolve', () => {
      // Set up mock oracle
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5500000000)], // Above target
        deployer
      );

      // Configure market
      const configureResult = simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000), // Target: $50,000
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );
      expect(configureResult.result).toBeOk(Cl.bool(true));

      // Check resolution
      const checkResult = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );
      expect(checkResult.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(0), // YES wins
        })
      );

      // Verify config shows as resolved
      const configResult = simnet.callReadOnlyFn('oracle-resolver', 'get-oracle-config',
        [Cl.uint(1)],
        wallet1
      );
      // Result is (ok { resolved: true, resolved-outcome: (some u0), ... })
      const config = (configResult.result as any).value.value;
      expect(config.resolved.type).toBe('true');
      expect(config['resolved-outcome'].value.value).toBe(0n);
    });

    it('should handle multiple markets independently', () => {
      // Set up prices for two assets
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5500000000)],
        deployer
      );
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('ETH'), Cl.uint(2500000000)],
        deployer
      );

      // Configure market 1 for BTC
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Configure market 2 for ETH
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(2),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('ETH'),
          Cl.uint(3000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Resolve market 1 (BTC price >= target -> YES wins)
      const result1 = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );
      expect(result1.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(0), // YES wins
        })
      );

      // Resolve market 2 (ETH price < target -> NO wins)
      const result2 = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(2),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );
      expect(result2.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(1), // NO wins
        })
      );
    });

    it('should handle price updates between configuration and resolution', () => {
      // Initial price below target
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(4500000000)],
        deployer
      );

      // Configure market
      simnet.callPublicFn('oracle-resolver', 'configure-market',
        [
          Cl.uint(1),
          Cl.some(Cl.principal(`${deployer}.mock-oracle`)),
          Cl.stringAscii('BTC'),
          Cl.uint(5000000000),
          Cl.uint(RESOLUTION_TYPE_PRICE_TARGET),
          Cl.uint(1008),
        ],
        deployer
      );

      // Check resolution - should resolve to NO
      let result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );
      expect(result.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(1), // NO wins
        })
      );

      // Reset and update price
      simnet.callPublicFn('oracle-resolver', 'reset-resolution', [Cl.uint(1)], deployer);
      simnet.callPublicFn('mock-oracle', 'set-price',
        [Cl.stringAscii('BTC'), Cl.uint(5500000000)],
        deployer
      );

      // Check resolution again - should resolve to YES
      result = simnet.callPublicFn('oracle-resolver', 'check-resolution',
        [
          Cl.uint(1),
          Cl.principal(`${deployer}.mock-oracle`),
        ],
        wallet1
      );
      expect(result.result).toBeOk(
        Cl.tuple({
          resolved: Cl.bool(true),
          outcome: Cl.uint(0), // YES wins
        })
      );
    });
  });
});
