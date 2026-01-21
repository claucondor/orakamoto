import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;

describe('AI Oracle Council Contract', () => {
  beforeEach(() => {
    // Reset state before each test
    // Note: In a real implementation, we might want to reset contract state
    // For now, tests are designed to be independent
  });

  describe('Constants and Initial State', () => {
    it('should return AI recommendation weight as 0 (advisory only)', () => {
      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-weight',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it('should return initial model ID counter as 0', () => {
      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-id-counter',
        [],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  describe('AI Model Registration', () => {
    it('should allow owner to register new AI model', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(1));

      // Verify model was registered
      const modelInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-model',
        [Cl.uint(1)],
        deployer
      );
      expect(modelInfo.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'model-id': Cl.uint(1),
            'model-name': Cl.stringAscii('GPT-4'),
            'is-active': Cl.bool(true),
            'total-predictions': Cl.uint(0),
            'correct-predictions': Cl.uint(0),
          })
        )
      );
    });

    it('should reject non-owner from registering model', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should allow owner to register multiple models', () => {
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Claude')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Llama-3')],
        deployer
      );

      const counter = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-id-counter',
        [],
        deployer
      );
      expect(counter.result).toBeOk(Cl.uint(3));
    });

    it('should reject registering more than max models', () => {
      // Register 5 models (max)
      for (let i = 1; i <= 5; i++) {
        simnet.callPublicFn(
          'ai-oracle-council',
          'register-ai-model',
          [Cl.stringAscii(`Model-${i}`)],
          deployer
        );
      }

      // Try to register 6th model
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Model-6')],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1508)); // ERR-MAX-MODELS-REACHED
    });
  });

  describe('AI Model Activation/Deactivation', () => {
    beforeEach(() => {
      // Register a model for testing
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
    });

    it('should allow owner to deactivate a model', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'deactivate-ai-model',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify model is deactivated
      const modelInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-model',
        [Cl.uint(1)],
        deployer
      );
      expect(modelInfo.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'model-id': Cl.uint(1),
            'model-name': Cl.stringAscii('GPT-4'),
            'is-active': Cl.bool(false),
            'total-predictions': Cl.uint(0),
            'correct-predictions': Cl.uint(0),
          })
        )
      );
    });

    it('should reject non-owner from deactivating model', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'deactivate-ai-model',
        [Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should allow owner to reactivate a model', () => {
      simnet.callPublicFn(
        'ai-oracle-council',
        'deactivate-ai-model',
        [Cl.uint(1)],
        deployer
      );

      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'reactivate-ai-model',
        [Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify model is active
      const modelInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-model',
        [Cl.uint(1)],
        deployer
      );
      expect(modelInfo.result).toBeOk(
        Cl.some(
          Cl.tuple({
            'model-id': Cl.uint(1),
            'model-name': Cl.stringAscii('GPT-4'),
            'is-active': Cl.bool(true),
            'total-predictions': Cl.uint(0),
            'correct-predictions': Cl.uint(0),
          })
        )
      );
    });
  });

  describe('AI Evaluation Request', () => {
    it('should allow anyone to request AI evaluation', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1), // market-id
          Cl.stringAscii('Will Bitcoin reach $100k by end of year?'), // question
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]), // evidence-links
        ],
        wallet1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify evaluation request was created
      const evalInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-market-evaluation',
        [Cl.uint(1)],
        deployer
      );
      // Just verify it returns ok with some value
      expect(evalInfo.result.type).toBe('ok');
    });

    it('should reject evaluation with empty question', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii(''),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1501)); // ERR-ZERO-AMOUNT
    });

    it('should reject duplicate evaluation request for same market', () => {
      simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Will Bitcoin reach $100k by end of year?'),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        wallet1
      );

      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Another question'),
          Cl.list([Cl.stringAscii('https://example.com/evidence2')]),
        ],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(1505)); // ERR-ALREADY-EVALUATED
    });
  });

  describe('AI Recommendation Recording', () => {
    beforeEach(() => {
      // Register models and request evaluation
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Claude')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Will Bitcoin reach $100k by end of year?'),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        wallet1
      );
    });

    it('should allow authorized AI bridge to record recommendation', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1), // market-id
          Cl.uint(1), // model-id
          Cl.uint(1), // outcome (YES)
          Cl.uint(850000), // confidence (85%)
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]), // evidence-links
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify recommendation was recorded
      const recInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-recommendation',
        [Cl.uint(1), Cl.uint(1)],
        deployer
      );
      // Just verify it returns ok with some value
      expect(recInfo.result.type).toBe('ok');
    });

    it('should reject non-authorized from recording recommendation', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject recommendation for non-existent market', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(999), // non-existent market
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1504)); // ERR-MARKET-NOT-FOUND
    });

    it('should reject recommendation from inactive model', () => {
      // Deactivate model 1
      simnet.callPublicFn(
        'ai-oracle-council',
        'deactivate-ai-model',
        [Cl.uint(1)],
        deployer
      );

      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1), // inactive model
          Cl.uint(1),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });

    it('should reject invalid outcome', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(99), // invalid outcome
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1502)); // ERR-INVALID-OUTCOME
    });

    it('should reject invalid confidence', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1100000), // 110% - exceeds 100%
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1503)); // ERR-INVALID-CONFIDENCE
    });

    it('should reject duplicate recommendation for same model/market', () => {
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );

      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(900000),
          Cl.list([Cl.stringAscii('https://example.com/evidence2')]),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1505)); // ERR-ALREADY-EVALUATED
    });
  });

  describe('AI Recommendation Aggregation', () => {
    beforeEach(() => {
      // Setup: register models, request evaluation, record recommendations
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Claude')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Llama-3')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Will Bitcoin reach $100k?'),
          Cl.list([Cl.stringAscii('https://example.com/evidence')]),
        ],
        wallet1
      );
    });

    it('should aggregate recommendations with majority outcome', () => {
      // Model 1: YES (outcome 1)
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(800000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );

      // Model 2: YES (outcome 1)
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(2),
          Cl.uint(1),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence2')]),
        ],
        deployer
      );

      // Model 3: NO (outcome 0)
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(3),
          Cl.uint(0),
          Cl.uint(750000),
          Cl.list([Cl.stringAscii('https://example.com/evidence3')]),
        ],
        deployer
      );

      // Get aggregated recommendation
      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-recommendation',
        [Cl.uint(1)],
        deployer
      );

      // Majority is YES (2 out of 3)
      // Avg confidence = (80 + 85 + 75) / 3 = 80 (rounded)
      expect(result.result).toBeOk(
        Cl.tuple({
          'outcome': Cl.some(Cl.uint(1)), // YES
          'avg-confidence': Cl.uint(800000), // 80%
          'model-count': Cl.uint(3),
        })
      );
    });

    it('should return no outcome for tie', () => {
      // Model 1: YES
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(800000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );

      // Model 2: NO
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(2),
          Cl.uint(0),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence2')]),
        ],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-recommendation',
        [Cl.uint(1)],
        deployer
      );

      // Tie - no majority outcome
      expect(result.result).toBeOk(
        Cl.tuple({
          'outcome': Cl.none(),
          'avg-confidence': Cl.uint(825000), // (80 + 85) / 2 = 82.5%
          'model-count': Cl.uint(2),
        })
      );
    });

    it('should handle no recommendations', () => {
      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-ai-recommendation',
        [Cl.uint(999)], // non-existent market
        deployer
      );

      expect(result.result).toBeOk(
        Cl.tuple({
          'outcome': Cl.none(),
          'avg-confidence': Cl.uint(0),
          'model-count': Cl.uint(0),
        })
      );
    });
  });

  describe('AI Accuracy Tracking', () => {
    beforeEach(() => {
      // Setup: register models, request evaluation, record recommendations
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Claude')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Will Bitcoin reach $100k?'),
          Cl.list([Cl.stringAscii('https://example.com/evidence')]),
        ],
        wallet1
      );
    });

    it('should update AI accuracy after market resolution', () => {
      // Model 1: YES (correct - winner is YES)
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(800000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );

      // Model 2: NO (incorrect - winner is YES)
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(2),
          Cl.uint(0),
          Cl.uint(850000),
          Cl.list([Cl.stringAscii('https://example.com/evidence2')]),
        ],
        deployer
      );

      // Update accuracy with winning outcome YES (1)
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'update-ai-accuracy',
        [Cl.uint(1), Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Check model 1 accuracy (correct)
      const model1Acc = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-accuracy',
        [Cl.uint(1)],
        deployer
      );
      expect(model1Acc.result).toBeOk(
        Cl.tuple({
          'accuracy': Cl.uint(1000000), // 100%
          'total': Cl.uint(1),
          'correct': Cl.uint(1),
        })
      );

      // Check model 2 accuracy (incorrect)
      const model2Acc = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-accuracy',
        [Cl.uint(2)],
        deployer
      );
      expect(model2Acc.result).toBeOk(
        Cl.tuple({
          'accuracy': Cl.uint(0), // 0%
          'total': Cl.uint(1),
          'correct': Cl.uint(0),
        })
      );
    });

    it('should reject non-owner from updating accuracy', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'update-ai-accuracy',
        [Cl.uint(1), Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });
  });

  describe('Get Active Models', () => {
    beforeEach(() => {
      // Register some models
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('Claude')],
        deployer
      );
    });

    it('should return active models', () => {
      const result = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-active-models',
        [],
        deployer
      );
      // Should return list of active model IDs
      expect(result.result).toBeOk(expect.anything());
    });
  });

  describe('Reset Recommendation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'ai-oracle-council',
        'register-ai-model',
        [Cl.stringAscii('GPT-4')],
        deployer
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'request-ai-evaluation',
        [
          Cl.uint(1),
          Cl.stringAscii('Will Bitcoin reach $100k?'),
          Cl.list([Cl.stringAscii('https://example.com/evidence')]),
        ],
        wallet1
      );
      simnet.callPublicFn(
        'ai-oracle-council',
        'record-ai-recommendation',
        [
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(1),
          Cl.uint(800000),
          Cl.list([Cl.stringAscii('https://example.com/evidence1')]),
        ],
        deployer
      );
    });

    it('should allow owner to reset recommendation', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'reset-ai-recommendation',
        [Cl.uint(1), Cl.uint(1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify recommendation is gone
      const recInfo = simnet.callReadOnlyFn(
        'ai-oracle-council',
        'get-model-recommendation',
        [Cl.uint(1), Cl.uint(1)],
        deployer
      );
      expect(recInfo.result).toBeOk(Cl.none());
    });

    it('should reject non-owner from resetting', () => {
      const result = simnet.callPublicFn(
        'ai-oracle-council',
        'reset-ai-recommendation',
        [Cl.uint(1), Cl.uint(1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1500)); // ERR-NOT-AUTHORIZED
    });
  });
});
