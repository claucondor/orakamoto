import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Helper to mine blocks (in devnet simulation)
const mineBlocks = (count: bigint) => {
  // In simnet, we can't actually mine blocks, so we'll advance block height
  // by calling read-only functions that don't change state
  for (let i = 0; i < Number(count); i++) {
    simnet.callReadOnlyFn('creator-rewards', 'get-current-epoch', [], deployer);
  }
};

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 900n;
const ERR_ZERO_AMOUNT = 902n;
const ERR_INSUFFICIENT_BALANCE = 903n;
const ERR_ALREADY_CLAIMED = 904n;
const ERR_NO_REWARDS = 905n;
const ERR_EPOCH_NOT_ENDED = 907n;
const ERR_ALREADY_DISTRIBUTED = 908n;
const ERR_NO_ELIGIBLE_CREATORS = 909n;

describe('Creator Rewards Contract', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict Creator Rewards'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals (8)', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Mint Functionality', () => {
    it('should allow contract owner to mint tokens', () => {
      const amount = 1_000_000_000n; // 10 PRED (8 decimals)
      const result = simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should reject mint from non-owner', () => {
      const amount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should update total supply when minting', () => {
      const amount = 5_000_000_000n; // 50 PRED
      simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );

      const supply = simnet.callReadOnlyFn('creator-rewards', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(amount));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint tokens to wallet1 before each test
      const amount = 10_000_000_000n; // 100 PRED
      simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const amount = 5_000_000_000n; // 50 PRED
      const result = simnet.callPublicFn(
        'creator-rewards',
        'transfer',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      const senderBalance = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(5_000_000_000n));

      const recipientBalance = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject transfer from non-owner', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'creator-rewards',
        'transfer',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'transfer',
        [Cl.uint(0), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject transfer with insufficient balance', () => {
      const amount = 20_000_000_000n; // 200 PRED (more than balance)
      const result = simnet.callPublicFn(
        'creator-rewards',
        'transfer',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.none()],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Mint tokens to wallet1 before each test
      const amount = 10_000_000_000n; // 100 PRED
      simnet.callPublicFn(
        'creator-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their tokens', () => {
      const amount = 5_000_000_000n; // 50 PRED
      const result = simnet.callPublicFn(
        'creator-rewards',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn with insufficient balance', () => {
      const amount = 20_000_000_000n; // 200 PRED (more than balance)
      const result = simnet.callPublicFn(
        'creator-rewards',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  describe('Epoch Management', () => {
    it('should initialize epoch correctly', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify epoch start block is set
      const startBlock = simnet.callReadOnlyFn('creator-rewards', 'get-epoch-start-block', [], deployer);
      expect(startBlock.result).toBeOk(Cl.uint(2n)); // First block after deployment
    });

    it('should reject epoch initialization from non-owner', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'initialize-epoch',
        [],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject epoch initialization if already initialized', () => {
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);
      const result = simnet.callPublicFn(
        'creator-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_DISTRIBUTED));
    });

    it('should advance epoch correctly', () => {
      // Initialize epoch
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);

      // Mine blocks to reach epoch end (1008 blocks)
      mineBlocks(1008n);

      const result = simnet.callPublicFn(
        'creator-rewards',
        'advance-epoch',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify current epoch
      const currentEpoch = simnet.callReadOnlyFn('creator-rewards', 'get-current-epoch', [], deployer);
      expect(currentEpoch.result).toBeOk(Cl.uint(2n));
    });

    it('should reject epoch advancement before epoch ends', () => {
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);
      const result = simnet.callPublicFn(
        'creator-rewards',
        'advance-epoch',
        [],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_EPOCH_NOT_ENDED));
    });
  });

  describe('Market Score Recording', () => {
    beforeEach(() => {
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);
    });

    it('should allow owner to record market score', () => {
      const tradingVolume = 10_000_000_000n; // 100,000 USDC
      const numberOfTrades = 50n;
      const market = Cl.standardPrincipal(wallet2);

      const result = simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), market, Cl.uint(tradingVolume), Cl.uint(numberOfTrades)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify score was recorded
      const score = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-creator-score',
        [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(score.result).toBeOk(Cl.uint(15_000_000_000n)); // 100,000 * 1.5
    });

    it('should calculate participation multiplier correctly for 1 trade', () => {
      const tradingVolume = 10_000_000_000n; // 100,000 USDC
      const numberOfTrades = 1n;
      const market = Cl.standardPrincipal(wallet2);

      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), market, Cl.uint(tradingVolume), Cl.uint(numberOfTrades)],
        deployer
      );

      // 100,000 * 1.01 = 101,000
      const score = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-creator-score',
        [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(score.result).toBeOk(Cl.uint(10_100_000_000n));
    });

    it('should cap participation multiplier at 2.0 for 100+ trades', () => {
      const tradingVolume = 10_000_000_000n; // 100,000 USDC
      const numberOfTrades = 150n;
      const market = Cl.standardPrincipal(wallet2);

      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), market, Cl.uint(tradingVolume), Cl.uint(numberOfTrades)],
        deployer
      );

      // 100,000 * 2.0 = 200,000
      const score = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-creator-score',
        [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(score.result).toBeOk(Cl.uint(20_000_000_000n));
    });

    it('should reject recording with zero trading volume', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(0), Cl.uint(10)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject recording from unauthorized caller', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(10_000_000_000n), Cl.uint(10)],
        wallet3
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Reward Distribution', () => {
    beforeEach(() => {
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);

      // Record market scores for wallet1 and wallet2
      // wallet1: 100,000 USDC volume, 50 trades = 150,000 score
      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(10_000_000_000n), Cl.uint(50)],
        deployer
      );

      // wallet2: 200,000 USDC volume, 100 trades = 400,000 score
      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet2), Cl.standardPrincipal(wallet3), Cl.uint(20_000_000_000n), Cl.uint(100)],
        deployer
      );

      // Mine blocks to reach epoch end
      mineBlocks(1008n);
    });

    it('should reject distribution from non-owner', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'distribute-rewards',
        [Cl.uint(1n), Cl.uint(1_000_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject distribution with zero reward amount', () => {
      const result = simnet.callPublicFn(
        'creator-rewards',
        'distribute-rewards',
        [Cl.uint(1n), Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });

  describe('Read-Only Functions', () => {
    beforeEach(() => {
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);
      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(10_000_000_000n), Cl.uint(50)],
        deployer
      );
    });

    it('should return correct total score for epoch', () => {
      const result = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-epoch-total-score',
        [Cl.uint(1n)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(15_000_000_000n));
    });

    it('should return correct total market score', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-total-market-score', [], deployer);
      expect(result.result).toBeOk(Cl.uint(15_000_000_000n));
    });

    it('should return correct current epoch', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-current-epoch', [], deployer);
      expect(result.result).toBeOk(Cl.uint(1n));
    });

    it('should return correct total rewards distributed', () => {
      const result = simnet.callReadOnlyFn('creator-rewards', 'get-total-rewards-distributed', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0n));
    });
  });

  describe('Integration Tests', () => {
    it('should handle multiple epochs independently', () => {
      // Epoch 1
      simnet.callPublicFn('creator-rewards', 'initialize-epoch', [], deployer);
      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(10_000_000_000n), Cl.uint(50)],
        deployer
      );

      mineBlocks(1008n);
      simnet.callPublicFn('creator-rewards', 'advance-epoch', [], deployer);

      // Epoch 2
      simnet.callPublicFn(
        'creator-rewards',
        'record-market-score',
        [Cl.standardPrincipal(wallet1), Cl.standardPrincipal(wallet2), Cl.uint(20_000_000_000n), Cl.uint(100)],
        deployer
      );

      mineBlocks(1008n);
      simnet.callPublicFn('creator-rewards', 'advance-epoch', [], deployer);

      // Verify scores are tracked per epoch
      const epoch1Score = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-creator-score',
        [Cl.uint(1n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(epoch1Score.result).toBeOk(Cl.uint(15_000_000_000n));

      const epoch2Score = simnet.callReadOnlyFn(
        'creator-rewards',
        'get-creator-score',
        [Cl.uint(2n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(epoch2Score.result).toBeOk(Cl.uint(40_000_000_000n));
    });
  });
});
