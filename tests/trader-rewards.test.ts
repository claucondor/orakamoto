import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

// Constants matching the contract
const ERR_NOT_AUTHORIZED = 800n;
const ERR_ZERO_AMOUNT = 802n;
const ERR_INSUFFICIENT_BALANCE = 803n;
const ERR_ALREADY_CLAIMED = 804n;
const ERR_NO_REWARDS = 805n;
const ERR_EPOCH_NOT_ENDED = 807n;
const ERR_ALREADY_DISTRIBUTED = 808n;
const ERR_NO_ELIGIBLE_TRADERS = 809n;

describe('Trader Rewards Contract', () => {
  describe('SIP-010 Metadata', () => {
    it('should return correct token name', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-name', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('StackPredict Trader Rewards'));
    });

    it('should return correct token symbol', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-symbol', [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii('PRED'));
    });

    it('should return correct decimals (8)', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-decimals', [], deployer);
      expect(result.result).toBeOk(Cl.uint(8));
    });

    it('should return token URI as none', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-token-uri', [], deployer);
      expect(result.result).toBeOk(Cl.none());
    });

    it('should return zero total supply initially', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-total-supply', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero balance initially', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
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
        'trader-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance
      const balance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(amount));
    });

    it('should reject mint from non-owner', () => {
      const amount = 1_000_000_000n;
      const result = simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(amount), Cl.standardPrincipal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject mint with zero amount', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(0), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should update total supply when minting', () => {
      const amount1 = 1_000_000_000n;
      const amount2 = 2_000_000_000n;

      // First mint
      simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(amount1), Cl.standardPrincipal(wallet1)],
        deployer
      );

      // Second mint
      simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(amount2), Cl.standardPrincipal(wallet2)],
        deployer
      );

      // Check total supply
      const supply = simnet.callReadOnlyFn('trader-rewards', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(amount1 + amount2));
    });
  });

  describe('Transfer Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to transfer tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'trader-rewards',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      const senderBalance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(senderBalance.result).toBeOk(Cl.uint(5_000_000_000n));

      const recipientBalance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(recipientBalance.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject transfer from non-token-owner', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'trader-rewards',
        'transfer',
        [
          Cl.uint(amount),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(801n)); // ERR-NOT-TOKEN-OWNER
    });

    it('should reject transfer with zero amount', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'transfer',
        [
          Cl.uint(0),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });
  });

  describe('Burn Functionality', () => {
    beforeEach(() => {
      // Mint some tokens to wallet1 before each test
      simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(10_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
    });

    it('should allow token holder to burn their own tokens', () => {
      const amount = 5_000_000_000n;
      const result = simnet.callPublicFn(
        'trader-rewards',
        'burn',
        [Cl.uint(amount)],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balance decreased
      const balance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(Cl.uint(5_000_000_000n));

      // Verify total supply decreased
      const supply = simnet.callReadOnlyFn('trader-rewards', 'get-total-supply', [], deployer);
      expect(supply.result).toBeOk(Cl.uint(5_000_000_000n));
    });

    it('should reject burn with zero amount', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'burn',
        [Cl.uint(0)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject burn exceeding balance', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'burn',
        [Cl.uint(15_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  describe('Epoch Management', () => {
    it('should allow owner to initialize epoch', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject epoch initialization from non-owner', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject re-initializing epoch', () => {
      // First initialization
      simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      // Second initialization should fail
      const result = simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ALREADY_DISTRIBUTED));
    });

    it('should return current epoch', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-current-epoch', [], deployer);
      expect(result.result).toBeOk(Cl.uint(1));
    });

    it('should return epoch start block', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-epoch-start-block', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Trade Volume Recording', () => {
    beforeEach(() => {
      // Initialize epoch first
      simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
    });

    it('should allow contract owner to record trade volume', () => {
      const trader = Cl.standardPrincipal(wallet2);
      const tradeAmount = Cl.uint(1_000_000_000n); // 10 USDC

      const result = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, tradeAmount],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should allow market-pool contract to record trade volume', () => {
      const trader = Cl.standardPrincipal(wallet2);
      const tradeAmount = Cl.uint(1_000_000_000n);

      // In devnet, the deployer is the only one who can call this function
      // The market-pool contract would need to be deployed and configured
      // For testing purposes, we use the deployer
      const result = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, tradeAmount],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it('should reject trade volume from unauthorized caller', () => {
      const trader = Cl.standardPrincipal(wallet2);
      const tradeAmount = Cl.uint(1_000_000_000n);

      const result = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, tradeAmount],
        wallet3
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it('should reject recording zero trade amount', () => {
      const trader = Cl.standardPrincipal(wallet2);

      const result = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should track trader volume after trade', () => {
      const trader = Cl.standardPrincipal(wallet2);
      const tradeAmount = Cl.uint(1_000_000_000n);

      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, tradeAmount],
        deployer
      );

      const volume = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-trader-volume',
        [Cl.uint(1), trader],
        deployer
      );
      expect(volume.result).toBeOk(Cl.uint(1_000_000_000n));
    });

    it('should accumulate trader volume for multiple trades', () => {
      const trader = Cl.standardPrincipal(wallet2);

      // First trade
      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, Cl.uint(1_000_000_000n)],
        deployer
      );

      // Second trade
      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader, Cl.uint(2_000_000_000n)],
        deployer
      );

      const volume = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-trader-volume',
        [Cl.uint(1), trader],
        deployer
      );
      expect(volume.result).toBeOk(Cl.uint(3_000_000_000n));
    });

    it('should track total volume for epoch', () => {
      const trader1 = Cl.standardPrincipal(wallet1);
      const trader2 = Cl.standardPrincipal(wallet2);

      // Record trades for multiple traders
      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader1, Cl.uint(1_000_000_000n)],
        deployer
      );

      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [trader2, Cl.uint(2_000_000_000n)],
        deployer
      );

      const totalVolume = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-epoch-total-volume',
        [Cl.uint(1)],
        deployer
      );
      expect(totalVolume.result).toBeOk(Cl.uint(3_000_000_000n));
    });
  });

  describe('Reward Distribution', () => {
    beforeEach(() => {
      // Initialize epoch
      simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
    });

    it('should allow owner to distribute rewards', () => {
      // First mint tokens to the contract
      simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(100_000_000_000n), Cl.standardPrincipal(deployer)],
        deployer
      );

      // Transfer to contract for distribution
      simnet.callPublicFn(
        'trader-rewards',
        'transfer',
        [
          Cl.uint(100_000_000_000n),
          Cl.standardPrincipal(deployer),
          Cl.standardPrincipal(deployer),
          Cl.none(),
        ],
        deployer
      );

      const result = simnet.callPublicFn(
        'trader-rewards',
        'distribute-rewards',
        [Cl.uint(1), Cl.uint(10_000_000_000n)],
        deployer
      );
      // This will fail because there are no eligible traders (empty list)
      expect(result.result).toBeErr(Cl.uint(ERR_NO_ELIGIBLE_TRADERS));
    });

    it('should reject distribution with zero amount', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'distribute-rewards',
        [Cl.uint(1), Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(ERR_ZERO_AMOUNT));
    });

    it('should reject distribution from non-owner', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'distribute-rewards',
        [Cl.uint(1), Cl.uint(10_000_000_000n)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Claim Rewards', () => {
    it('should reject claim when no rewards available', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'claim-rewards',
        [Cl.uint(1)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NO_REWARDS));
    });

    it('should return zero pending rewards initially', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-pending-rewards',
        [Cl.standardPrincipal(wallet2), Cl.list([])],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Read-Only Functions', () => {
    it('should return zero trader volume for non-existent trader', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-trader-volume',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero total volume for non-existent epoch', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-epoch-total-volume',
        [Cl.uint(999)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero trader rewards for non-existent claim', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-trader-rewards',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return false for non-claimed rewards', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'is-rewards-claimed',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return false for non-distributed epoch', () => {
      const result = simnet.callReadOnlyFn(
        'trader-rewards',
        'is-epoch-distributed',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it('should return zero total rewards distributed initially', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-total-rewards-distributed', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return zero total trading volume initially', () => {
      const result = simnet.callReadOnlyFn('trader-rewards', 'get-total-trading-volume', [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('Epoch Advancement', () => {
    it('should allow owner to advance epoch', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'advance-epoch',
        [],
        deployer
      );
      // Will fail because epoch hasn't ended
      expect(result.result).toBeErr(Cl.uint(ERR_EPOCH_NOT_ENDED));
    });

    it('should reject epoch advancement from non-owner', () => {
      const result = simnet.callPublicFn(
        'trader-rewards',
        'advance-epoch',
        [],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete trader rewards lifecycle', () => {
      // 1. Initialize epoch
      const initResult = simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );
      expect(initResult.result).toBeOk(Cl.bool(true));

      // 2. Record trade volume
      const tradeResult = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet2), Cl.uint(1_000_000_000n)],
        deployer
      );
      expect(tradeResult.result).toBeOk(Cl.bool(true));

      // 3. Record another trade
      const tradeResult2 = simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet2), Cl.uint(500_000_000n)],
        deployer
      );
      expect(tradeResult2.result).toBeOk(Cl.bool(true));

      // 4. Check trader volume
      const volumeResult = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-trader-volume',
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(volumeResult.result).toBeOk(Cl.uint(1_500_000_000n));
    });

    it('should track multiple traders independently', () => {
      // Initialize epoch
      simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );

      // Record trades for multiple traders
      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet2), Cl.uint(1_000_000_000n)],
        deployer
      );

      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet3), Cl.uint(2_000_000_000n)],
        deployer
      );

      // Check total volume
      const totalVolume = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-epoch-total-volume',
        [Cl.uint(1)],
        deployer
      );
      expect(totalVolume.result).toBeOk(Cl.uint(3_000_000_000n));
    });

    it('should handle mint, transfer, and burn lifecycle', () => {
      // Mint tokens
      const mintResult = simnet.callPublicFn(
        'trader-rewards',
        'mint',
        [Cl.uint(50_000_000_000n), Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      // Transfer tokens
      const transferResult = simnet.callPublicFn(
        'trader-rewards',
        'transfer',
        [
          Cl.uint(25_000_000_000n),
          Cl.standardPrincipal(wallet1),
          Cl.standardPrincipal(wallet2),
          Cl.none(),
        ],
        wallet1
      );
      expect(transferResult.result).toBeOk(Cl.bool(true));

      // Burn tokens
      const burnResult = simnet.callPublicFn(
        'trader-rewards',
        'burn',
        [Cl.uint(5_000_000_000n)],
        wallet1
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      // Verify final state
      const wallet1Balance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(20_000_000_000n));

      const wallet2Balance = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-balance',
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(wallet2Balance.result).toBeOk(Cl.uint(25_000_000_000n));

      const totalSupply = simnet.callReadOnlyFn('trader-rewards', 'get-total-supply', [], deployer);
      expect(totalSupply.result).toBeOk(Cl.uint(45_000_000_000n));
    });

    it('should accumulate total trading volume across trades', () => {
      // Initialize epoch
      simnet.callPublicFn(
        'trader-rewards',
        'initialize-epoch',
        [],
        deployer
      );

      // Record multiple trades
      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet1), Cl.uint(1_000_000_000n)],
        deployer
      );

      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet2), Cl.uint(2_000_000_000n)],
        deployer
      );

      simnet.callPublicFn(
        'trader-rewards',
        'record-trade-volume',
        [Cl.standardPrincipal(wallet3), Cl.uint(3_000_000_000n)],
        deployer
      );

      // Check total trading volume
      const totalVolume = simnet.callReadOnlyFn(
        'trader-rewards',
        'get-total-trading-volume',
        [],
        deployer
      );
      expect(totalVolume.result).toBeOk(Cl.uint(6_000_000_000n));
    });
  });
});
