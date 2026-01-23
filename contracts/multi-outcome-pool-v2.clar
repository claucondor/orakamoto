;; Multi-Outcome Pool V2 Contract - Multi-Market Architecture
;; Implements LMSR (Logarithmic Market Scoring Rule) for markets with 2-10 outcomes
;;
;; TODO: This contract is INCOMPLETE and requires full implementation.
;; The LMSR pricing functions below are stubs that need to be completed.
;; See PRD-v4-legacy-migration.md Phase 1 for full implementation requirements.
;;
;; Based on:
;; - SIP-013 Semi-Fungible Token Standard (for LP tokens)
;; - Multi-market architecture (similar to multi-market-pool.clar)
;; - LMSR pricing for multi-outcome markets
;;
;; Key Design:
;; - Multiple markets identified by market-id
;; - LP tokens are SIP-013 tokens (token-id = market-id + MULTI-OUTCOME-ID-OFFSET)
;; - Outcome tokens tracked as internal maps (gas efficient)
;; - Supports 2-10 outcomes per market

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Precision for fixed-point calculations
(define-constant PRECISION u1000000)

;; Trading Fee: 1% (100 basis points)
(define-constant TRADING-FEE-BP u100)

;; Fee Distribution (must sum to 10000)
;; 70% of fees go to LPs
(define-constant LP-FEE-SHARE-BP u7000)
;; 10% of fees go to market creator
(define-constant CREATOR-FEE-SHARE-BP u1000)
;; 20% of fees go to protocol
(define-constant PROTOCOL-FEE-SHARE-BP u2000)

;; Dispute window for claims (~7 days in blocks)
(define-constant DISPUTE-WINDOW u1008)

;; Minimum initial liquidity for creating a market (1 USDC = 1000000)
(define-constant MINIMUM-INITIAL-LIQUIDITY u1000000)

;; Minimum liquidity to add/remove (0.1 USDC)
(define-constant MINIMUM-LIQUIDITY u100000)

;; Maximum number of outcomes per market
(define-constant MAX-OUTCOMES u10)

;; Minimum number of outcomes per market
(define-constant MIN-OUTCOMES u2)

;; LP Token ID offset to avoid collision with binary markets
;; Binary markets: market-id 1, 2, 3, ...
;; Multi-outcome markets: token-id 1000001, 1000002, ...
(define-constant MULTI-OUTCOME-ID-OFFSET u1000000)

;; ============================================================================
;; IMPORTANT: Contract References
;; ============================================================================
;; DO NOT use constants for contract references - causes Unchecked(ContractCallExpectName)
;; Use direct references in contract-call?: .usdcx, .sip013-lp-token
;;
;; Simnet/Devnet: Use local contract references (.usdcx, .sip013-lp-token)
;; Testnet: Update to deployed principals
;; Mainnet: Update to deployed principals
;; ============================================================================

;; ============================================================================
;; ERROR CONSTANTS
;; ============================================================================

;; General Errors (u6000-u6099)
(define-constant ERR-MARKET-NOT-FOUND (err u6000))
(define-constant ERR-MARKET-NOT-ACTIVE (err u6001))
(define-constant ERR-MARKET-ALREADY-RESOLVED (err u6002))
(define-constant ERR-DEADLINE-NOT-PASSED (err u6003))
(define-constant ERR-INVALID-OUTCOME (err u6004))
(define-constant ERR-INSUFFICIENT-BALANCE (err u6005))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u6006))
(define-constant ERR-ZERO-AMOUNT (err u6007))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u6008))
(define-constant ERR-ALREADY-CLAIMED (err u6009))
(define-constant ERR-NO-WINNINGS (err u6010))
(define-constant ERR-DISPUTE-WINDOW-ACTIVE (err u6011))
(define-constant ERR-INVALID-QUESTION (err u6012))
(define-constant ERR-INVALID-DEADLINE (err u6013))
(define-constant ERR-INVALID-OUTCOME-COUNT (err u6014))
(define-constant ERR-INVALID-LABELS (err u6015))
(define-constant ERR-NOT-AUTHORIZED (err u6016))

;; ============================================================================
;; DATA STRUCTURES
;; ============================================================================

;; Market counter - used to generate unique market IDs
(define-data-var market-count uint u0)

;; Market data structure - stores all market information
;; Key: market-id (uint)
;; Value: Market tuple with creator, question, deadlines, reserves, fees, resolution status
(define-map markets
  uint
  {
    ;; Market creator
    creator: principal,
    ;; Market question (max 256 UTF-8 bytes)
    question: (string-utf8 256),
    ;; Trading deadline (block height)
    deadline: uint,
    ;; Resolution deadline (block height)
    resolution-deadline: uint,
    ;; Number of outcomes (2-10)
    outcome-count: uint,
    ;; Outcome labels
    outcome-labels: (list 10 (string-utf8 32)),
    ;; LMSR liquidity parameter b (scaled by PRECISION)
    lmsr-b: uint,
    ;; Total liquidity (LP tokens)
    total-liquidity: uint,
    ;; Accumulated trading fees
    accumulated-fees: uint,
    ;; Whether market is resolved
    is-resolved: bool,
    ;; Winning outcome (0 to outcome-count-1)
    winning-outcome: (optional uint),
    ;; Block height when market was resolved
    resolution-block: uint,
    ;; Block height when market was created
    created-at: uint,
  }
)

;; Outcome reserves for each market
;; Key: { market-id, outcome }
;; Value: reserve amount (uint)
(define-map outcome-reserves
  { market-id: uint, outcome: uint }
  uint
)

;; Outcome balances - tracks outcome positions for each user
;; Key: { market-id, owner, outcome }
;; Value: balance (uint)
(define-map outcome-balances
  { market-id: uint, owner: principal, outcome: uint }
  uint
)

;; Track if user has claimed winnings for a market
;; Key: { market-id, owner }
;; Value: bool (true = claimed)
(define-map has-claimed
  { market-id: uint, owner: principal }
  bool
)

;; Track creator fees for each market
;; Key: market-id
;; Value: accumulated creator fees
(define-map creator-fees
  uint
  uint
)

;; Track protocol fees for each market
;; Key: market-id
;; Value: accumulated protocol fees
(define-map protocol-fees
  uint
  uint
)

;; ============================================================================
;; LMSR MATH HELPER FUNCTIONS
;; ============================================================================

;; exp-approx: Calculate e^x using Taylor series
;; x is scaled by PRECISION (e.g., x = 500000 means 0.5)
;; exp(x) approx 1 + x + x^2/2! + x^3/3! + x^4/4! + x^5/5!
(define-read-only (exp-approx (x uint))
  (let
    (
      (x-scaled (to-int x))
      (precision-int (to-int PRECISION))
      (x-2 (/ (* x-scaled x-scaled) precision-int))
      (x-3 (/ (* x-2 x-scaled) precision-int))
      (x-4 (/ (* x-3 x-scaled) precision-int))
      (x-5 (/ (* x-4 x-scaled) precision-int))
      ;; Calculate terms: 1 + x + x^2/2 + x^3/6 + x^4/24 + x^5/120
      (term1 precision-int)
      (term2 x-scaled)
      (term3 (/ x-2 (to-int u2)))
      (term4 (/ x-3 (to-int u6)))
      (term5 (/ x-4 (to-int u24)))
      (term6 (/ x-5 (to-int u120)))
      (sum (+ (+ (+ (+ (+ term1 term2) term3) term4) term5) term6))
    )
    (if (<= sum 0)
      u0
      (to-uint sum)
    )
  )
)

;; ln-approx: Calculate natural log using series expansion
;; ln(1 + x) approx x - x^2/2 + x^3/3 - x^4/4 + ... for |x| < 1
;; For values > 1, we use: ln(a) = ln(a/2^k) + k*ln(2)
(define-read-only (ln-approx (x uint))
  (let
    (
      (x-int (to-int x))
      (precision-int (to-int PRECISION))
    )
    ;; Handle edge cases
    (if (<= x-int 0)
      u0
      (if (is-eq x-int precision-int)
        u0  ;; ln(1) = 0
        (begin
          ;; For x > 1, we need to scale down
          ;; ln(x) = ln(x / e^k) + k for some k
          ;; Simplified: use iterative approximation
          (let
            (
              ;; Use Newton-Raphson style approximation
              ;; ln(x) approx 2 * (x-1)/(x+1) for x close to 1
              (numerator (* (- x-int precision-int) (to-int u2)))
              (denominator (+ x-int precision-int))
              (approx (/ numerator denominator))
            )
            (if (<= approx 0)
              u0
              (to-uint approx)
            )
          )
        )
      )
    )
  )
)

;; Calculate LMSR cost function: Cost(q) = b * ln(sum(exp(q_i / b)))
;; q is the outcome reserves (quantities of tokens in pool)
;; b is the liquidity parameter (lmsr-b)
;; Returns cost as a uint (scaled by PRECISION)
(define-read-only (calculate-lmsr-cost (market-id uint) (b-arg uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (let
          (
            (outcome-count (get outcome-count some-market))
            ;; Build quantities list from outcome reserves
            ;; For LMSR, q_i = reserve for outcome i
            (q-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
            (q-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
            (q-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
            (q-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
            (q-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
            (q-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
            (q-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
            (q-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
            (q-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
            (q-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
            (quantities (list q-0 q-1 q-2 q-3 q-4 q-5 q-6 q-7 q-8 q-9))
          )
          ;; Calculate sum of exp(q_i / b)
          (let
            (
              (exp-sum (fold + (map exp-approx (map / quantities (list b-arg b-arg b-arg b-arg b-arg b-arg b-arg b-arg b-arg b-arg))) u0))
              ;; ln of the sum
              (ln-sum (ln-approx exp-sum))
              ;; Cost = b * ln(sum)
              (cost (/ (* b-arg ln-sum) PRECISION))
            )
            cost
          )
        )
      u0  ;; Return 0 if market not found
    )
  )
)

;; Calculate price for outcome i: Price_i = exp(q_i / b) / sum(exp(q_j / b))
;; Returns price as a uint (scaled by PRECISION)
(define-read-only (calculate-lmsr-price (market-id uint) (outcome uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (let
          (
            (b (get lmsr-b some-market))
            ;; Get reserve for the outcome
            (q-i (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: outcome })))
            ;; Calculate exp(q_i / b)
            (exp-q-i (exp-approx (/ q-i b)))
            ;; Calculate sum of exp(q_j / b) for all j
            (q-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
            (q-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
            (q-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
            (q-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
            (q-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
            (q-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
            (q-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
            (q-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
            (q-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
            (q-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
            (quantities (list q-0 q-1 q-2 q-3 q-4 q-5 q-6 q-7 q-8 q-9))
            (exp-sum (fold + (map exp-approx (map / quantities (list b b b b b b b b b b))) u0))
          )
          (if (is-eq exp-sum u0)
            (/ PRECISION (get outcome-count some-market))  ;; Equal probability if no reserves
            (/ (* exp-q-i PRECISION) exp-sum)
          )
        )
      u0  ;; Return 0 if market not found
    )
  )
)

;; Get all prices for all outcomes in a market
;; Returns a list of prices (scaled by PRECISION)
(define-read-only (get-outcome-prices (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (let
          (
            (outcome-count (get outcome-count some-market))
            (b (get lmsr-b some-market))
            (q-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
            (q-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
            (q-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
            (q-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
            (q-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
            (q-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
            (q-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
            (q-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
            (q-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
            (q-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
            (quantities (list q-0 q-1 q-2 q-3 q-4 q-5 q-6 q-7 q-8 q-9))
            (exp-sum (fold + (map exp-approx (map / quantities (list b b b b b b b b b b))) u0))
            (price-0 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-0 b)) PRECISION) exp-sum)))
            (price-1 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-1 b)) PRECISION) exp-sum)))
            (price-2 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-2 b)) PRECISION) exp-sum)))
            (price-3 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-3 b)) PRECISION) exp-sum)))
            (price-4 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-4 b)) PRECISION) exp-sum)))
            (price-5 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-5 b)) PRECISION) exp-sum)))
            (price-6 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-6 b)) PRECISION) exp-sum)))
            (price-7 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-7 b)) PRECISION) exp-sum)))
            (price-8 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-8 b)) PRECISION) exp-sum)))
            (price-9 (if (is-eq exp-sum u0) (/ PRECISION outcome-count) (/ (* (exp-approx (/ q-9 b)) PRECISION) exp-sum)))
          )
          (ok (list price-0 price-1 price-2 price-3 price-4 price-5 price-6 price-7 price-8 price-9))
        )
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; ============================================================================
;; HELPER FUNCTIONS
;; ============================================================================

;; Get LP token-id for a market (with offset to avoid collision)
(define-private (get-lp-token-id (market-id uint))
  (+ MULTI-OUTCOME-ID-OFFSET market-id)
)

;; Validate market-id exists
(define-private (market-exists (market-id uint))
  (is-some (map-get? markets market-id))
)

;; Validate outcome is valid for market
(define-private (is-valid-outcome-for-market (market-id uint) (outcome uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (< outcome (get outcome-count some-market))
      false
    )
  )
)

;; Calculate fee from amount
(define-read-only (calculate-fee (amount uint))
  (/ (* amount TRADING-FEE-BP) u10000)
)

;; Calculate LP tokens to mint for adding liquidity
;; lp-tokens = (amount * current-total) / (sum of all outcome reserves)
;; For multi-outcome markets, we sum reserves across all outcomes
(define-read-only (calculate-lp-tokens
    (amount uint)
    (market-id uint)
    (total-liquidity uint)
  )
  (if (is-eq total-liquidity u0)
    amount  ;; First deposit gets 1:1 LP tokens
    (let
      (
        ;; Calculate sum of all outcome reserves
        (q-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
        (q-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
        (q-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
        (q-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
        (q-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
        (q-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
        (q-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
        (q-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
        (q-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
        (q-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
        (quantities (list q-0 q-1 q-2 q-3 q-4 q-5 q-6 q-7 q-8 q-9))
        (total-reserves (fold + quantities u0))
      )
      (/ (* amount total-liquidity) total-reserves)
    )
  )
)

;; Calculate USDC to return when removing liquidity
;; Returns USDC from reserves + fee share
(define-read-only (calculate-remove-liquidity-return
    (lp-amount uint)
    (market-id uint)
    (total-liquidity uint)
    (accumulated-fees uint)
  )
  (let
    (
      ;; Calculate sum of all outcome reserves
      (q-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
      (q-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
      (q-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
      (q-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
      (q-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
      (q-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
      (q-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
      (q-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
      (q-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
      (q-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
      (quantities (list q-0 q-1 q-2 q-3 q-4 q-5 q-6 q-7 q-8 q-9))
      (total-reserves (fold + quantities u0))
      (usdc-from-reserves (/ (* total-reserves lp-amount) total-liquidity))
      (lp-fee-pool (/ (* accumulated-fees LP-FEE-SHARE-BP) u10000))
      (fee-share (/ (* lp-fee-pool lp-amount) total-liquidity))
    )
    (+ usdc-from-reserves fee-share)
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS - Market Queries
;; ============================================================================

;; Get market information by market-id
(define-read-only (get-market (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok some-market)
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get total number of markets
(define-read-only (get-market-count)
  (ok (var-get market-count))
)

;; Get outcome token balance for a user
(define-read-only (get-outcome-balance (market-id uint) (owner principal) (outcome uint))
  (ok (default-to u0 (map-get? outcome-balances { market-id: market-id, owner: owner, outcome: outcome })))
)

;; Get LP balance for a user in a market
;; Delegates to SIP-013 LP token contract
(define-read-only (get-lp-balance (market-id uint) (owner principal))
  (let
    (
      (token-id (get-lp-token-id market-id))
    )
    (contract-call? .sip013-lp-token get-balance token-id owner)
  )
)

;; Get outcome reserves for a market
;; Returns a list of reserves for all 10 possible outcomes
(define-read-only (get-outcome-reserves (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok {
          reserve-0: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })),
          reserve-1: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })),
          reserve-2: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })),
          reserve-3: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })),
          reserve-4: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })),
          reserve-5: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })),
          reserve-6: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })),
          reserve-7: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })),
          reserve-8: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })),
          reserve-9: (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })),
        })
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get accumulated fees for a market
(define-read-only (get-accumulated-fees (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok {
          accumulated-fees: (get accumulated-fees some-market),
          creator-fees: (default-to u0 (map-get? creator-fees market-id)),
          protocol-fees: (default-to u0 (map-get? protocol-fees market-id))
        })
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Check if a market is active (not resolved and before deadline)
(define-read-only (is-market-active (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok (and
          (not (get is-resolved some-market))
          (< block-height (get deadline some-market))
        ))
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get claim status for a user
(define-read-only (get-claim-status (market-id uint) (owner principal))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (let
          (
            (is-resolved (get is-resolved some-market))
            (resolution-block (get resolution-block some-market))
            (claimed (default-to false (map-get? has-claimed { market-id: market-id, owner: owner })))
            (winning (get winning-outcome some-market))
          )
          (ok {
            is-resolved: is-resolved,
            resolution-block: resolution-block,
            dispute-window-ends: (+ resolution-block DISPUTE-WINDOW),
            claims-enabled: (and is-resolved (>= block-height (+ resolution-block DISPUTE-WINDOW))),
            has-claimed: claimed,
            winning-outcome: winning
          })
        )
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - Market Management
;; ============================================================================

;; Create a new multi-outcome prediction market
;; @param question: The market question (max 256 UTF-8 bytes)
;; @param deadline: Trading deadline (block height)
;; @param resolution-deadline: Resolution deadline (block height)
;; @param initial-liquidity: Initial liquidity in USDCx (min 1 USDC)
;; @param outcome-count: Number of outcomes (2-10)
;; @param outcome-labels: Labels for each outcome (max 32 chars each)
;; @param lmsr-b: LMSR liquidity parameter b (scaled by PRECISION)
;; @returns (response uint uint): The market-id on success, error code on failure
(define-public (create-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline uint)
    (initial-liquidity uint)
    (outcome-count uint)
    (outcome-labels (list 10 (string-utf8 32)))
    (lmsr-b uint)
  )
  (let
    (
      (caller tx-sender)
      (current-block block-height)
    )
    ;; Validate question is not empty
    (asserts! (> (len question) u0) ERR-INVALID-QUESTION)

    ;; Validate deadline is in the future
    (asserts! (> deadline current-block) ERR-INVALID-DEADLINE)

    ;; Validate resolution-deadline is after deadline
    (asserts! (> resolution-deadline deadline) ERR-INVALID-DEADLINE)

    ;; Validate minimum initial liquidity
    (asserts! (>= initial-liquidity MINIMUM-INITIAL-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

    ;; Validate outcome count
    (asserts! (>= outcome-count MIN-OUTCOMES) ERR-INVALID-OUTCOME-COUNT)
    (asserts! (<= outcome-count MAX-OUTCOMES) ERR-INVALID-OUTCOME-COUNT)

    ;; Validate outcome-labels length matches outcome-count
    (asserts! (is-eq (len outcome-labels) outcome-count) ERR-INVALID-LABELS)

    ;; Validate lmsr-b is positive
    (asserts! (> lmsr-b u0) ERR-ZERO-AMOUNT)

    ;; Get current market count and calculate new market-id
    (let
      (
        (current-count (var-get market-count))
        (market-id (+ current-count u1))
        (lp-token-id (get-lp-token-id market-id))
      )

      ;; Transfer USDCx from creator to contract
      (try! (contract-call? .usdcx transfer initial-liquidity caller (as-contract tx-sender) none))

      ;; Calculate initial reserve for each outcome (equal split)
      ;; Reserve per outcome = initial-liquidity / outcome-count
      (let
        (
          (reserve-per-outcome (/ initial-liquidity outcome-count))
        )
        ;; Initialize outcome reserves for all outcomes
        ;; We set reserves for all 10 possible outcomes, but only outcome-count will be used
        (map-set outcome-reserves { market-id: market-id, outcome: u0 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u1 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u2 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u3 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u4 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u5 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u6 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u7 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u8 } reserve-per-outcome)
        (map-set outcome-reserves { market-id: market-id, outcome: u9 } reserve-per-outcome)

        ;; Create market entry
        (map-set markets market-id
          {
            creator: caller,
            question: question,
            deadline: deadline,
            resolution-deadline: resolution-deadline,
            outcome-count: outcome-count,
            outcome-labels: outcome-labels,
            lmsr-b: lmsr-b,
            total-liquidity: initial-liquidity,
            accumulated-fees: u0,
            is-resolved: false,
            winning-outcome: none,
            resolution-block: u0,
            created-at: current-block,
          }
        )

        ;; Initialize fee maps
        (map-set creator-fees market-id u0)
        (map-set protocol-fees market-id u0)

        ;; Mint LP tokens to creator
        (try! (contract-call? .sip013-lp-token mint lp-token-id initial-liquidity caller))

        ;; Increment market count
        (var-set market-count market-id)

        ;; Emit event
        (print {
          event: "multi-outcome-market-created",
          market-id: market-id,
          creator: caller,
          question: question,
          deadline: deadline,
          resolution-deadline: resolution-deadline,
          initial-liquidity: initial-liquidity,
          outcome-count: outcome-count,
          outcome-labels: outcome-labels,
          lmsr-b: lmsr-b,
        })

        ;; Return market-id
        (ok market-id)
      )
    )
  )
)

;; Add liquidity to an existing market
;; @param market-id: The market to add liquidity to
;; @param amount: USDCx amount to add (min 0.1 USDC)
;; @returns (response uint uint): LP tokens minted on success, error code on failure
(define-public (add-liquidity (market-id uint) (amount uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (outcome-count (get outcome-count market-data))
      )
      ;; Validate market is not resolved
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)

      ;; Validate amount is above minimum
      (asserts! (>= amount MINIMUM-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

      ;; Transfer USDCx from user to contract
      (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

      ;; Calculate LP tokens to mint (proportional)
      (let
        (
          (lp-tokens (calculate-lp-tokens amount market-id (get total-liquidity market-data)))
          (lp-token-id (get-lp-token-id market-id))
        )

        ;; Distribute liquidity equally across all outcomes
        ;; Add to all outcome reserves (equal distribution)
        (let
          (
            (amount-per-outcome (/ amount outcome-count))
          )
          (map-set outcome-reserves { market-id: market-id, outcome: u0 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u1 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u2 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u3 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u4 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u5 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u6 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u7 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u8 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })) amount-per-outcome))
          (map-set outcome-reserves { market-id: market-id, outcome: u9 } (+ (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })) amount-per-outcome))
        )

        ;; Update market total liquidity
        (map-set markets market-id
          (merge market-data { total-liquidity: (+ (get total-liquidity market-data) amount) })
        )

        ;; Mint LP tokens to user
        (try! (contract-call? .sip013-lp-token mint lp-token-id lp-tokens caller))

        ;; Emit event
        (print {
          event: "liquidity-added",
          market-id: market-id,
          provider: caller,
          amount: amount,
          lp-tokens: lp-tokens,
        })

        ;; Return LP tokens minted
        (ok lp-tokens)
      )
    )
  )
)

;; Remove liquidity from a market
;; @param market-id: The market to remove liquidity from
;; @param lp-amount: LP tokens to burn (min 0.1 USDC equivalent)
;; @returns (response uint uint): USDC returned to user on success, error code on failure
(define-public (remove-liquidity (market-id uint) (lp-amount uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
      (lp-token-id (get-lp-token-id market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (outcome-count (get outcome-count market-data))
        (total-liquidity (get total-liquidity market-data))
        (accumulated-fees (get accumulated-fees market-data))
      )

      ;; Validate LP amount is above minimum
      (asserts! (>= lp-amount MINIMUM-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

      ;; Calculate USDC to return (reserves + fee share)
      (let
        (
          (usdc-return (calculate-remove-liquidity-return lp-amount market-id total-liquidity accumulated-fees))
        )

        ;; Burn LP tokens from caller
        (try! (contract-call? .sip013-lp-token burn lp-token-id lp-amount caller))

        ;; Calculate proportional reduction for each outcome reserve
        ;; Each outcome reserve is reduced proportionally to lp-amount / total-liquidity
        (let
          (
            (reserve-0 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u0 })))
            (portion-0 (/ (* reserve-0 lp-amount) total-liquidity))
            (reserve-1 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u1 })))
            (portion-1 (/ (* reserve-1 lp-amount) total-liquidity))
            (reserve-2 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u2 })))
            (portion-2 (/ (* reserve-2 lp-amount) total-liquidity))
            (reserve-3 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u3 })))
            (portion-3 (/ (* reserve-3 lp-amount) total-liquidity))
            (reserve-4 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u4 })))
            (portion-4 (/ (* reserve-4 lp-amount) total-liquidity))
            (reserve-5 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u5 })))
            (portion-5 (/ (* reserve-5 lp-amount) total-liquidity))
            (reserve-6 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u6 })))
            (portion-6 (/ (* reserve-6 lp-amount) total-liquidity))
            (reserve-7 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u7 })))
            (portion-7 (/ (* reserve-7 lp-amount) total-liquidity))
            (reserve-8 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u8 })))
            (portion-8 (/ (* reserve-8 lp-amount) total-liquidity))
            (reserve-9 (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: u9 })))
            (portion-9 (/ (* reserve-9 lp-amount) total-liquidity))
          )
          (map-set outcome-reserves { market-id: market-id, outcome: u0 } (- reserve-0 portion-0))
          (map-set outcome-reserves { market-id: market-id, outcome: u1 } (- reserve-1 portion-1))
          (map-set outcome-reserves { market-id: market-id, outcome: u2 } (- reserve-2 portion-2))
          (map-set outcome-reserves { market-id: market-id, outcome: u3 } (- reserve-3 portion-3))
          (map-set outcome-reserves { market-id: market-id, outcome: u4 } (- reserve-4 portion-4))
          (map-set outcome-reserves { market-id: market-id, outcome: u5 } (- reserve-5 portion-5))
          (map-set outcome-reserves { market-id: market-id, outcome: u6 } (- reserve-6 portion-6))
          (map-set outcome-reserves { market-id: market-id, outcome: u7 } (- reserve-7 portion-7))
          (map-set outcome-reserves { market-id: market-id, outcome: u8 } (- reserve-8 portion-8))
          (map-set outcome-reserves { market-id: market-id, outcome: u9 } (- reserve-9 portion-9))
        )

        ;; Calculate fee share to distribute
        (let
          (
            (lp-fee-pool (/ (* accumulated-fees LP-FEE-SHARE-BP) u10000))
            (fee-share (/ (* lp-fee-pool lp-amount) total-liquidity))
          )

          ;; Update market data
          (map-set markets market-id
            {
              creator: (get creator market-data),
              question: (get question market-data),
              deadline: (get deadline market-data),
              resolution-deadline: (get resolution-deadline market-data),
              outcome-count: outcome-count,
              outcome-labels: (get outcome-labels market-data),
              lmsr-b: (get lmsr-b market-data),
              total-liquidity: (- total-liquidity lp-amount),
              accumulated-fees: u0, ;; Reset accumulated fees after liquidity removal
              is-resolved: (get is-resolved market-data),
              winning-outcome: (get winning-outcome market-data),
              resolution-block: (get resolution-block market-data),
              created-at: (get created-at market-data),
            }
          )

          ;; Transfer USDC to caller
          (try! (as-contract (contract-call? .usdcx transfer usdc-return tx-sender caller none)))

          ;; Emit event
          (print {
            event: "liquidity-removed",
            market-id: market-id,
            provider: caller,
            lp-amount: lp-amount,
            usdc-returned: usdc-return,
            fee-share: fee-share,
          })

          ;; Return USDC amount
          (ok usdc-return)
        )
      )
    )
  )
)

;; Buy outcome tokens from a market
;; @param market-id: The market to buy from
;; @param outcome: Outcome to buy (0 to outcome-count-1)
;; @param amount: USDCx amount to spend
;; @param max-cost: Maximum cost in USDC (slippage protection) - can be set to amount for no additional slippage
;; @returns (response uint uint): Tokens received on success, error code on failure
(define-public (buy-outcome
    (market-id uint)
    (outcome uint)
    (amount uint)
    (max-cost uint)
  )
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
        (outcome-count (get outcome-count market-data))
      )
      ;; Validate market is active (not resolved and before deadline)
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)
      (asserts! (< block-height deadline) ERR-MARKET-NOT-ACTIVE)

      ;; Validate outcome is valid
      (asserts! (< outcome outcome-count) ERR-INVALID-OUTCOME)

      ;; Validate amount is above zero
      (asserts! (> amount u0) ERR-ZERO-AMOUNT)

      ;; Validate max-cost is at least amount
      (asserts! (>= max-cost amount) ERR-SLIPPAGE-TOO-HIGH)

      ;; Get current price for the outcome using LMSR
      (let
        (
          (current-price (calculate-lmsr-price market-id outcome))
          ;; Calculate fee
          (fee (calculate-fee amount))
          (amount-after-fee (- amount fee))
          ;; Calculate tokens to receive: tokens = amount / price
          (tokens-out (/ (* amount-after-fee PRECISION) current-price))
        )

        ;; Transfer USDCx from user to contract (use amount, not amount-after-fee, for transfer)
        (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

        ;; Accumulate fees
        (let
          (
            (old-accumulated-fees (get accumulated-fees market-data))
            (new-accumulated-fees (+ old-accumulated-fees fee))
            (creator-fee-portion (/ (* fee CREATOR-FEE-SHARE-BP) u10000))
            (protocol-fee-portion (/ (* fee PROTOCOL-FEE-SHARE-BP) u10000))
            (old-creator-fees (default-to u0 (map-get? creator-fees market-id)))
            (old-protocol-fees (default-to u0 (map-get? protocol-fees market-id)))
          )

          ;; Update fee maps
          (map-set creator-fees market-id (+ old-creator-fees creator-fee-portion))
          (map-set protocol-fees market-id (+ old-protocol-fees protocol-fee-portion))

          ;; Update outcome reserve (add amount-after-fee to the outcome being bought)
          (let
            (
              (current-reserve (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: outcome })))
              (new-reserve (+ current-reserve amount-after-fee))
            )
            (map-set outcome-reserves { market-id: market-id, outcome: outcome } new-reserve)
          )

          ;; Update market data
          (map-set markets market-id
            (merge market-data { accumulated-fees: new-accumulated-fees })
          )

          ;; Credit outcome tokens to user
          (let
            (
              (outcome-key { market-id: market-id, owner: caller, outcome: outcome })
              (current-balance (default-to u0 (map-get? outcome-balances outcome-key)))
            )
            (map-set outcome-balances outcome-key (+ current-balance tokens-out))

            ;; Emit event
            (print {
              event: "outcome-bought",
              market-id: market-id,
              buyer: caller,
              outcome: outcome,
              amount-spent: amount,
              tokens-received: tokens-out,
              fee: fee,
            })

            ;; Return tokens received
            (ok tokens-out)
          )
        )
      )
    )
  )
)

;; Sell outcome tokens back to the market
;; @param market-id: The market to sell to
;; @param outcome: Outcome to sell (0 to outcome-count-1)
;; @param token-amount: Number of outcome tokens to sell
;; @param min-return: Minimum USDC to receive (slippage protection)
;; @returns (response uint uint): USDC received on success, error code on failure
(define-public (sell-outcome
    (market-id uint)
    (outcome uint)
    (token-amount uint)
    (min-return uint)
  )
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
        (outcome-count (get outcome-count market-data))
      )
      ;; Validate market is active (not resolved and before deadline)
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)
      (asserts! (< block-height deadline) ERR-MARKET-NOT-ACTIVE)

      ;; Validate outcome is valid
      (asserts! (< outcome outcome-count) ERR-INVALID-OUTCOME)

      ;; Validate token-amount is above zero
      (asserts! (> token-amount u0) ERR-ZERO-AMOUNT)

      ;; Get user's outcome balance
      (let
        (
          (outcome-key { market-id: market-id, owner: caller, outcome: outcome })
          (current-balance (default-to u0 (map-get? outcome-balances outcome-key)))
        )
        ;; Validate user has enough tokens
        (asserts! (>= current-balance token-amount) ERR-INSUFFICIENT-BALANCE)

        ;; Get current price for the outcome using LMSR
        (let
          (
            (current-price (calculate-lmsr-price market-id outcome))
            ;; Calculate USDC to receive: usdc = tokens * price
            (usdc-out-gross (/ (* token-amount current-price) PRECISION))
            (fee (calculate-fee usdc-out-gross))
            (usdc-out-net (- usdc-out-gross fee))
          )
          ;; Validate slippage protection
          (asserts! (>= usdc-out-net min-return) ERR-SLIPPAGE-TOO-HIGH)

          ;; Update outcome reserve (subtract token-amount from the outcome being sold)
          (let
            (
              (current-reserve (default-to u0 (map-get? outcome-reserves { market-id: market-id, outcome: outcome })))
              (new-reserve
                (if (> current-reserve token-amount)
                  (- current-reserve token-amount)
                  u0  ;; Prevent underflow
                )
              )
            )
            (map-set outcome-reserves { market-id: market-id, outcome: outcome } new-reserve)
          )

          ;; Accumulate fees
          (let
            (
              (old-accumulated-fees (get accumulated-fees market-data))
              (new-accumulated-fees (+ old-accumulated-fees fee))
              (creator-fee-portion (/ (* fee CREATOR-FEE-SHARE-BP) u10000))
              (protocol-fee-portion (/ (* fee PROTOCOL-FEE-SHARE-BP) u10000))
              (old-creator-fees (default-to u0 (map-get? creator-fees market-id)))
              (old-protocol-fees (default-to u0 (map-get? protocol-fees market-id)))
            )

            ;; Update fee maps
            (map-set creator-fees market-id (+ old-creator-fees creator-fee-portion))
            (map-set protocol-fees market-id (+ old-protocol-fees protocol-fee-portion))

            ;; Update market data
            (map-set markets market-id
              (merge market-data { accumulated-fees: new-accumulated-fees })
            )

            ;; Debit outcome tokens from user
            (map-set outcome-balances outcome-key (- current-balance token-amount))

            ;; Transfer USDC to user
            (try! (as-contract (contract-call? .usdcx transfer usdc-out-net (as-contract tx-sender) caller none)))

            ;; Emit event
            (print {
              event: "outcome-sold",
              market-id: market-id,
              seller: caller,
              outcome: outcome,
              tokens-sold: token-amount,
              usdc-received: usdc-out-net,
              fee: fee,
            })

            ;; Return USDC received
            (ok usdc-out-net)
          )
        )
      )
    )
  )
)

;; Resolve a market by setting the winning outcome
;; @param market-id: The market to resolve
;; @param outcome: The winning outcome (0 to outcome-count-1)
;; @returns (response bool bool): true on success, error code on failure
(define-public (resolve (market-id uint) (outcome uint))
  (let
    (
      (caller contract-caller)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (creator (get creator market-data))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
        (outcome-count (get outcome-count market-data))
      )
      ;; Validate caller is the market creator
      (asserts! (is-eq caller creator) ERR-NOT-AUTHORIZED)

      ;; Validate market is not already resolved
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)

      ;; Validate deadline has passed
      (asserts! (>= block-height deadline) ERR-DEADLINE-NOT-PASSED)

      ;; Validate outcome is valid
      (asserts! (< outcome outcome-count) ERR-INVALID-OUTCOME)

      ;; Resolve the market
      (map-set markets market-id
        {
          creator: creator,
          question: (get question market-data),
          deadline: deadline,
          resolution-deadline: (get resolution-deadline market-data),
          outcome-count: outcome-count,
          outcome-labels: (get outcome-labels market-data),
          lmsr-b: (get lmsr-b market-data),
          total-liquidity: (get total-liquidity market-data),
          accumulated-fees: (get accumulated-fees market-data),
          is-resolved: true,
          winning-outcome: (some outcome),
          resolution-block: block-height,
          created-at: (get created-at market-data),
        }
      )

      ;; Emit event
      (print {
        event: "multi-outcome-market-resolved",
        market-id: market-id,
        resolver: caller,
        winning-outcome: outcome,
        resolution-block: block-height,
      })

      ;; Return success
      (ok true)
    )
  )
)

;; Claim winnings for a resolved market
;; @param market-id: The market to claim winnings from
;; @returns (response uint uint): USDC claimed on success, error code on failure
(define-public (claim (market-id uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
      (claim-key { market-id: market-id, owner: caller })
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (resolution-block (get resolution-block market-data))
        (winning-outcome (get winning-outcome market-data))
      )
      ;; Validate market is resolved
      (asserts! is-resolved ERR-MARKET-NOT-ACTIVE)

      ;; Validate dispute window has passed
      (asserts! (>= block-height (+ resolution-block DISPUTE-WINDOW)) ERR-DISPUTE-WINDOW-ACTIVE)

      ;; Validate user has not already claimed
      (asserts! (not (default-to false (map-get? has-claimed claim-key))) ERR-ALREADY-CLAIMED)

      ;; Validate winning outcome is set
      (asserts! (is-some winning-outcome) ERR-NO-WINNINGS)

      (let
        (
          (winning-outcome-value (unwrap! winning-outcome ERR-NO-WINNINGS))
          ;; Get user's balance of the winning outcome tokens
          (outcome-key { market-id: market-id, owner: caller, outcome: winning-outcome-value })
          (winning-tokens (default-to u0 (map-get? outcome-balances outcome-key)))
        )
        ;; Validate user has winning tokens
        (asserts! (> winning-tokens u0) ERR-NO-WINNINGS)

        ;; Calculate winnings: winning tokens are worth their face value in USDC
        ;; Since outcome tokens are tracked in the same units as USDC (6 decimals),
        ;; the winning tokens can be claimed 1:1 for USDC from the reserves

        ;; Mark user as claimed
        (map-set has-claimed claim-key true)

        ;; Clear the user's outcome balance for the winning outcome
        (map-set outcome-balances outcome-key u0)

        ;; Transfer USDC to the winner
        (try! (as-contract (contract-call? .usdcx transfer winning-tokens (as-contract tx-sender) caller none)))

        ;; Emit event
        (print {
          event: "winnings-claimed",
          market-id: market-id,
          winner: caller,
          winning-outcome: winning-outcome-value,
          amount: winning-tokens,
        })

        ;; Return claimed amount
        (ok winning-tokens)
      )
    )
  )
)
