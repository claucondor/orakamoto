;; ============================================================================
;; TODO: NEEDS V3 MIGRATION - NOT YET INTEGRATED WITH MULTI-MARKET ARCHITECTURE
;; ============================================================================
;;
;; CURRENT STATUS: Working but uses SINGLETON model (like deprecated market-pool)
;;
;; REQUIRED CHANGES FOR V3 INTEGRATION:
;; 1. Convert from singleton (data-var) to multi-market (define-map markets uint {...})
;; 2. Add market-id parameter to all public functions
;; 3. Integrate with market-factory-v3.clar (currently create-multi-outcome-market returns err)
;; 4. Add SIP-013 LP token support (replace internal lp-balances map)
;; 5. Consider using pm-amm-core.clar math or keep LMSR (LMSR may be better for multi-outcome)
;;
;; CURRENT ARCHITECTURE (Singleton - needs migration):
;; - Uses data-var for market state (one market per contract)
;; - Internal LP token tracking (non-transferable)
;; - LMSR pricing (good for multi-outcome, may keep)
;;
;; TARGET ARCHITECTURE (Multi-market):
;; - Use define-map for markets (multiple markets per contract)
;; - SIP-013 LP tokens (transferable, composable)
;; - Integrate with market-factory-v3.clar
;;
;; PRIORITY: Medium - Binary markets (multi-market-pool) are primary focus
;; DEPENDENCY: market-factory-v3.clar needs create-multi-outcome-market implemented
;;
;; ============================================================================

;; Multi-Outcome Market Pool Contract
;; Implements LMSR (Logarithmic Market Scoring Rule) for markets with 2-10 outcomes
;; Uses integer approximations for exp() and ln() since Clarity has no native functions
;; NOTE: This contract does NOT implement prediction-market-trait as it's designed for multi-outcome markets

;; Constants
(define-constant PRECISION u1000000)
(define-constant TRADING-FEE-BP u100)           ;; 1% total fee
(define-constant LP-FEE-SHARE-BP u7000)         ;; 70% of fees go to LPs
(define-constant CREATOR-FEE-SHARE-BP u1000)    ;; 10% of fees go to creator
(define-constant PROTOCOL-FEE-SHARE-BP u2000)   ;; 20% of fees go to protocol
(define-constant DISPUTE-WINDOW u1008)          ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant MAX-OUTCOMES u10)              ;; Maximum 10 outcomes per market
(define-constant LMSR-B-PRECISION u1000000)     ;; Precision for LMSR liquidity parameter b

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u2000))
(define-constant ERR-MARKET-NOT-ACTIVE (err u2001))
(define-constant ERR-MARKET-ALREADY-RESOLVED (err u2002))
(define-constant ERR-DEADLINE-NOT-PASSED (err u2003))
(define-constant ERR-INVALID-OUTCOME (err u2004))
(define-constant ERR-INSUFFICIENT-BALANCE (err u2005))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u2006))
(define-constant ERR-ZERO-AMOUNT (err u2007))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u2008))
(define-constant ERR-ALREADY-CLAIMED (err u2009))
(define-constant ERR-NO-WINNINGS (err u2010))
(define-constant ERR-NOT-INITIALIZED (err u2011))
(define-constant ERR-ALREADY-INITIALIZED (err u2012))
(define-constant ERR-DISPUTE-WINDOW-ACTIVE (err u2013))
(define-constant ERR-DISPUTE-ALREADY-OPENED (err u2014))
(define-constant ERR-DISPUTE-ALREADY-CLOSED (err u2015))
(define-constant ERR-INVALID-OUTCOME-COUNT (err u2016))
(define-constant ERR-OUTCOME-NOT-RESOLVED (err u2017))
(define-constant ERR-ALREADY-DEPOSITED (err u2018))
(define-constant ERR-INSUFFICIENT-IDLE-LIQUIDITY (err u2019))

;; Data Variables - Market State
(define-data-var market-question (string-utf8 256) u"")
(define-data-var market-creator principal tx-sender)
(define-data-var market-deadline uint u0)
(define-data-var resolution-deadline uint u0)
(define-data-var creator-collateral uint u0)
(define-data-var is-resolved bool false)
(define-data-var is-disputed bool false)
(define-data-var winning-outcome (optional uint) none)
(define-data-var total-liquidity uint u0)
(define-data-var accumulated-fees uint u0)
(define-data-var is-initialized bool false)
(define-data-var resolution-block uint u0)
(define-data-var dispute-deadline uint u0)
(define-data-var outcome-count uint u0)          ;; Number of outcomes in this market
(define-data-var lmsr-b uint u0)                ;; LMSR liquidity parameter (scaled by PRECISION)
(define-data-var deposited-to-yield uint u0)     ;; Amount deposited to yield source

;; Data Maps
(define-map lp-balances principal uint)
(define-map outcome-balances { owner: principal, outcome: uint } uint)
(define-map has-claimed principal bool)

;; LMSR Math Helper Functions
;; Using integer approximations for exp() and ln()

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
;; q is an array of "quantities" (outcome tokens held)
;; b is the liquidity parameter
(define-read-only (calculate-lmsr-cost (quantities (list 10 uint)) (b uint))
  (let
    (
      ;; Calculate sum of exp(q_i / b)
      (exp-sum (fold + (map exp-approx (map / quantities (list b b b b b b b b b b))) u0))
      ;; ln of the sum
      (ln-sum (ln-approx exp-sum))
      ;; Cost = b * ln(sum)
      (cost (/ (* b ln-sum) PRECISION))
    )
    cost
  )
)

;; Calculate price for outcome i: Price_i = exp(q_i / b) / sum(exp(q_j / b))
(define-read-only (calculate-price (outcome uint) (quantities (list 10 uint)) (b uint))
  (let
    (
      (q-i (default-to u0 (element-at quantities outcome)))
      (exp-q-i (exp-approx (/ q-i b)))
      (exp-sum (fold + (map exp-approx (map / quantities (list b b b b b b b b b b))) u0))
    )
    (if (is-eq exp-sum u0)
      (/ PRECISION u2)  ;; 50% if no liquidity
      (/ (* exp-q-i PRECISION) exp-sum)
    )
  )
)

;; Get all prices for all outcomes
(define-read-only (get-all-prices (quantities (list 10 uint)) (b uint))
  (let
    (
      (exp-sum (fold + (map exp-approx (map / quantities (list b b b b b b b b b b))) u0))
      (price-0 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u0)) b)) PRECISION) exp-sum)))
      (price-1 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u1)) b)) PRECISION) exp-sum)))
      (price-2 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u2)) b)) PRECISION) exp-sum)))
      (price-3 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u3)) b)) PRECISION) exp-sum)))
      (price-4 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u4)) b)) PRECISION) exp-sum)))
      (price-5 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u5)) b)) PRECISION) exp-sum)))
      (price-6 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u6)) b)) PRECISION) exp-sum)))
      (price-7 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u7)) b)) PRECISION) exp-sum)))
      (price-8 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u8)) b)) PRECISION) exp-sum)))
      (price-9 (if (is-eq exp-sum u0) (/ PRECISION u2) (/ (* (exp-approx (/ (default-to u0 (element-at quantities u9)) b)) PRECISION) exp-sum)))
    )
    (ok {
      prices: (list price-0 price-1 price-2 price-3 price-4 price-5 price-6 price-7 price-8 price-9),
      exp-sum: exp-sum
    })
  )
)

;; Initialize market with multiple outcomes
(define-public (initialize
    (question (string-utf8 256))
    (deadline uint)
    (res-deadline uint)
    (initial-liquidity uint)
    (num-outcomes uint)
    (b uint)
  )
  (let
    (
      (caller tx-sender)
    )
    (asserts! (not (var-get is-initialized)) ERR-ALREADY-INITIALIZED)
    (asserts! (> initial-liquidity u0) ERR-ZERO-AMOUNT)
    (asserts! (> deadline block-height) ERR-INVALID-OUTCOME)
    (asserts! (> res-deadline deadline) ERR-INVALID-OUTCOME)
    (asserts! (>= num-outcomes u2) ERR-INVALID-OUTCOME-COUNT)
    (asserts! (<= num-outcomes MAX-OUTCOMES) ERR-INVALID-OUTCOME-COUNT)
    (asserts! (> b u0) ERR-ZERO-AMOUNT)

    ;; Transfer initial liquidity from creator
    (try! (contract-call? .usdcx transfer initial-liquidity caller (as-contract tx-sender) none))

    ;; Set market parameters
    (var-set market-question question)
    (var-set market-creator caller)
    (var-set market-deadline deadline)
    (var-set resolution-deadline res-deadline)
    (var-set creator-collateral initial-liquidity)
    (var-set outcome-count num-outcomes)
    (var-set lmsr-b b)
    (var-set total-liquidity initial-liquidity)

    ;; Mint LP tokens to creator
    (map-set lp-balances caller initial-liquidity)

    (var-set is-initialized true)

    (print { event: "multi-outcome-market-initialized", creator: caller, question: question, deadline: deadline, initial-liquidity: initial-liquidity, num-outcomes: num-outcomes, b: b })
    (ok true)
  )
)

;; Read-only Functions

(define-read-only (get-market-info)
  (ok {
    question: (var-get market-question),
    creator: (var-get market-creator),
    deadline: (var-get market-deadline),
    resolution-deadline: (var-get resolution-deadline),
    is-resolved: (var-get is-resolved),
    winning-outcome: (var-get winning-outcome),
    outcome-count: (var-get outcome-count),
    lmsr-b: (var-get lmsr-b)
  })
)

;; Get prices for all outcomes using LMSR
(define-read-only (get-prices)
  (let
    (
      (num-outcomes (var-get outcome-count))
      (b (var-get lmsr-b))
      ;; Build quantities list from outcome balances (sum of all tokens held)
      ;; For simplicity, we use total tokens minted as proxy for quantities
      ;; In production, this would track actual token holdings
      (quantities (list u0 u0 u0 u0 u0 u0 u0 u0 u0 u0))
    )
    (get-all-prices quantities b)
  )
)

;; Get reserves (for LMSR, this represents the liquidity pool)
(define-read-only (get-reserves)
  (ok {
    total-liquidity: (var-get total-liquidity),
    lmsr-b: (var-get lmsr-b)
  })
)

(define-read-only (get-lp-balance (who principal))
  (ok (default-to u0 (map-get? lp-balances who)))
)

(define-read-only (get-outcome-balance (who principal) (outcome uint))
  (ok (default-to u0 (map-get? outcome-balances { owner: who, outcome: outcome })))
)

(define-read-only (get-total-liquidity)
  (ok (var-get total-liquidity))
)

(define-read-only (get-accumulated-fees)
  (ok (var-get accumulated-fees))
)

(define-read-only (get-dispute-window-info)
  (let
    (
      (res-block (var-get resolution-block))
      (is-res (var-get is-resolved))
    )
    (ok {
      dispute-window-blocks: DISPUTE-WINDOW,
      resolution-block: res-block,
      dispute-window-ends: (if is-res (+ res-block DISPUTE-WINDOW) u0),
      claims-enabled: (and is-res (>= block-height (+ res-block DISPUTE-WINDOW)))
    })
  )
)

;; Fee calculation
(define-read-only (calculate-fee (amount uint))
  (/ (* amount TRADING-FEE-BP) u10000)
)

;; Add Liquidity
;; Deposits USDC and distributes proportionally across all outcomes
(define-public (add-liquidity (amount uint))
  (let
    (
      (caller tx-sender)
      (current-total (var-get total-liquidity))
      (num-outcomes (var-get outcome-count))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Transfer USDC from user to contract
    (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

    ;; Calculate LP tokens to mint
    (let
      (
        (lp-tokens-to-mint
          (if (is-eq current-total u0)
            amount  ;; First deposit gets 1:1 LP tokens
            (/ (* amount current-total) (var-get total-liquidity))
          )
        )
        (current-lp-balance (default-to u0 (map-get? lp-balances caller)))
      )
      ;; Update total liquidity
      (var-set total-liquidity (+ current-total lp-tokens-to-mint))

      ;; Mint LP tokens
      (map-set lp-balances caller (+ current-lp-balance lp-tokens-to-mint))

      (print { event: "liquidity-added", provider: caller, amount: amount, lp-tokens: lp-tokens-to-mint, num-outcomes: num-outcomes })
      (ok lp-tokens-to-mint)
    )
  )
)

;; Remove Liquidity
;; Burns LP tokens and returns proportional share of liquidity
(define-public (remove-liquidity (lp-amount uint))
  (let
    (
      (caller tx-sender)
      (current-lp-balance (default-to u0 (map-get? lp-balances caller)))
      (current-total-lp (var-get total-liquidity))
      (current-fees (var-get accumulated-fees))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (> lp-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= lp-amount current-lp-balance) ERR-INSUFFICIENT-BALANCE)
    (asserts! (> current-total-lp u0) ERR-INSUFFICIENT-LIQUIDITY)

    (let
      (
        ;; Calculate proportional share of liquidity
        (share (/ (* (var-get total-liquidity) lp-amount) current-total-lp))
        ;; Calculate proportional share of LP fees (70% of accumulated fees)
        (lp-fee-pool (/ (* current-fees LP-FEE-SHARE-BP) u10000))
        (fee-share (/ (* lp-fee-pool lp-amount) current-total-lp))
        ;; Total to return
        (total-return (+ share fee-share))
      )
      ;; Update state
      (var-set total-liquidity (- current-total-lp lp-amount))
      (var-set accumulated-fees (- current-fees fee-share))

      ;; Burn LP tokens
      (map-set lp-balances caller (- current-lp-balance lp-amount))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .usdcx transfer total-return tx-sender caller none)))

      (print {
        event: "liquidity-removed",
        provider: caller,
        lp-tokens-burned: lp-amount,
        fee-share: fee-share,
        total-returned: total-return
      })
      (ok { usdc-returned: share, fee-share: fee-share })
    )
  )
)

;; Buy Outcome Tokens (LMSR-based)
;; outcome: 0 to (num-outcomes - 1)
;; amount: USDC to spend
;; min-tokens-out: minimum tokens to receive (slippage protection)
(define-public (buy-outcome (outcome uint) (amount uint) (min-tokens-out uint))
  (let
    (
      (caller tx-sender)
      (num-outcomes (var-get outcome-count))
      (b (var-get lmsr-b))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (< block-height (var-get market-deadline)) ERR-MARKET-NOT-ACTIVE)
    (asserts! (< outcome num-outcomes) ERR-INVALID-OUTCOME)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Calculate fee
    (let
      (
        (fee (calculate-fee amount))
        (amount-after-fee (- amount fee))
        ;; Get current quantities for all outcomes
        ;; For now, we use a simplified model where quantities are based on reserves
        ;; In a full implementation, we'd track actual token holdings
        (quantities (list u0 u0 u0 u0 u0 u0 u0 u0 u0 u0))
        ;; Calculate current price for the outcome
        (current-price (calculate-price outcome quantities b))
        ;; Calculate tokens to receive: tokens = amount / price
        (tokens-out (/ (* amount-after-fee PRECISION) current-price))
      )
      (asserts! (>= tokens-out min-tokens-out) ERR-SLIPPAGE-TOO-HIGH)

      ;; Transfer USDC from user to contract
      (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

      ;; Accumulate fees
      (var-set accumulated-fees (+ (var-get accumulated-fees) fee))

      ;; Credit outcome tokens to user
      (let
        (
          (current-balance (default-to u0 (map-get? outcome-balances { owner: caller, outcome: outcome })))
        )
        (map-set outcome-balances { owner: caller, outcome: outcome } (+ current-balance tokens-out))
      )

      (print { event: "outcome-bought", buyer: caller, outcome: outcome, amount-spent: amount, tokens-received: tokens-out, fee: fee })
      (ok tokens-out)
    )
  )
)

;; Sell Outcome Tokens (LMSR-based)
;; outcome: 0 to (num-outcomes - 1)
;; token-amount: outcome tokens to sell
;; min-usdc-out: minimum USDC to receive (slippage protection)
(define-public (sell-outcome (outcome uint) (token-amount uint) (min-usdc-out uint))
  (let
    (
      (caller tx-sender)
      (num-outcomes (var-get outcome-count))
      (b (var-get lmsr-b))
      (current-balance (default-to u0 (map-get? outcome-balances { owner: caller, outcome: outcome })))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (< block-height (var-get market-deadline)) ERR-MARKET-NOT-ACTIVE)
    (asserts! (< outcome num-outcomes) ERR-INVALID-OUTCOME)
    (asserts! (> token-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= token-amount current-balance) ERR-INSUFFICIENT-BALANCE)

    ;; Calculate USDC to receive
    (let
      (
        ;; Get current quantities for all outcomes
        (quantities (list u0 u0 u0 u0 u0 u0 u0 u0 u0 u0))
        ;; Calculate current price for the outcome
        (current-price (calculate-price outcome quantities b))
        ;; Calculate USDC to receive: usdc = tokens * price
        (usdc-out-gross (/ (* token-amount current-price) PRECISION))
        (fee (calculate-fee usdc-out-gross))
        (usdc-out-net (- usdc-out-gross fee))
      )
      (asserts! (>= usdc-out-net min-usdc-out) ERR-SLIPPAGE-TOO-HIGH)

      ;; Update state
      (var-set accumulated-fees (+ (var-get accumulated-fees) fee))

      ;; Debit outcome tokens from user
      (map-set outcome-balances { owner: caller, outcome: outcome } (- current-balance token-amount))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .usdcx transfer usdc-out-net tx-sender caller none)))

      (print { event: "outcome-sold", seller: caller, outcome: outcome, tokens-sold: token-amount, usdc-received: usdc-out-net, fee: fee })
      (ok usdc-out-net)
    )
  )
)

;; Resolve Market
;; Only creator can resolve after deadline
(define-public (resolve (outcome uint))
  (let
    (
      (caller contract-caller)
      (num-outcomes (var-get outcome-count))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (>= block-height (var-get market-deadline)) ERR-DEADLINE-NOT-PASSED)
    (asserts! (< outcome num-outcomes) ERR-INVALID-OUTCOME)

    (var-set is-resolved true)
    (var-set winning-outcome (some outcome))
    (var-set resolution-block block-height)

    (print { event: "market-resolved", resolver: caller, winning-outcome: outcome, dispute-window-ends: (+ block-height DISPUTE-WINDOW) })
    (ok true)
  )
)

;; Claim Winnings
;; Winners can claim after resolution AND after the dispute window has passed
(define-public (claim)
  (let
    (
      (caller tx-sender)
      (winning (var-get winning-outcome))
      (res-block (var-get resolution-block))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (var-get is-resolved) ERR-MARKET-NOT-ACTIVE)
    (asserts! (is-some winning) ERR-MARKET-NOT-ACTIVE)
    ;; Check that dispute window has passed
    (asserts! (>= block-height (+ res-block DISPUTE-WINDOW)) ERR-DISPUTE-WINDOW-ACTIVE)
    (asserts! (not (default-to false (map-get? has-claimed caller))) ERR-ALREADY-CLAIMED)

    (let
      (
        (win-outcome (unwrap! winning ERR-MARKET-NOT-ACTIVE))
        (winner-balance (default-to u0 (map-get? outcome-balances { owner: caller, outcome: win-outcome })))
      )
      (asserts! (> winner-balance u0) ERR-NO-WINNINGS)

      ;; Mark as claimed
      (map-set has-claimed caller true)

      ;; Clear outcome balance
      (map-set outcome-balances { owner: caller, outcome: win-outcome } u0)

      ;; Transfer winnings (1:1 with winning tokens)
      (try! (as-contract (contract-call? .usdcx transfer winner-balance tx-sender caller none)))

      (print { event: "winnings-claimed", winner: caller, amount: winner-balance })
      (ok winner-balance)
    )
  )
)

;; Open Dispute
(define-public (open-dispute (stake-amount uint))
  (let
    (
      (caller contract-caller)
      (winning (var-get winning-outcome))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (var-get is-resolved) ERR-MARKET-NOT-ACTIVE)
    (asserts! (is-some winning) ERR-MARKET-NOT-ACTIVE)
    (asserts! (not (var-get is-disputed)) ERR-DISPUTE-ALREADY-OPENED)
    (asserts! (>= stake-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)

    (var-set is-disputed true)
    (var-set dispute-deadline (+ (var-get resolution-block) DISPUTE-WINDOW))
    (map-set lp-balances caller (+ (default-to u0 (map-get? lp-balances caller)) stake-amount))

    (print { event: "dispute-opened", opener: caller, winning-outcome: winning, stake-amount: stake-amount })
    (ok stake-amount)
  )
)

;; Finalize Resolution
(define-public (finalize-resolution (approve-dispute (optional bool)))
  (let
    (
      (caller contract-caller)
      (winning (var-get winning-outcome))
      (current-dispute-deadline (var-get dispute-deadline))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (var-get is-resolved) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (>= block-height (var-get resolution-block)) ERR-DEADLINE-NOT-PASSED)
    (asserts! (>= block-height current-dispute-deadline) ERR-DISPUTE-WINDOW-ACTIVE)

    (if (var-get is-disputed)
      (if (or (is-none approve-dispute) (is-eq (unwrap! approve-dispute ERR-MARKET-NOT-ACTIVE) false))
        (begin
          (var-set is-disputed false)
          (print { event: "dispute-reverted", reverter: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
          (ok { reverted: true, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        )
        (begin
          (var-set is-disputed false)
          (print { event: "dispute-finalized", approver: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
          (ok { reverted: false, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        )
      )
      (begin
        (var-set is-disputed false)
        (print { event: "resolution-finalized", finalizer: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        (ok { reverted: false, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
      )
    )
  )
)

;; Get Dispute Status
(define-read-only (get-dispute-status)
  (let
    (
      (res-block (var-get resolution-block))
      (res-deadline (var-get resolution-deadline))
      (dis-deadline (var-get dispute-deadline))
      (is-dis (var-get is-disputed))
      (winning (var-get winning-outcome))
    )
    (ok {
      is-resolved: (var-get is-resolved),
      winning-outcome: winning,
      is-disputed: is-dis,
      resolution-block: res-block,
      resolution-deadline: res-deadline,
      dispute-deadline: dis-deadline,
      claims-enabled: (and (var-get is-resolved) (>= block-height (+ res-block DISPUTE-WINDOW)))
    })
  )
)

;; Deposit Idle Funds to Yield Source
;; Moves 90% of idle pool liquidity to the yield source (mock-zest-vault)
;; This allows the pool to earn yield on unused liquidity
;; Only callable by contract owner when market is active (before resolution)
(define-public (deposit-idle-funds)
  (let
    (
      (caller contract-caller)
      (current-liquidity (var-get total-liquidity))
      (current-deposited (var-get deposited-to-yield))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq current-deposited u0) ERR-ALREADY-DEPOSITED)
    (asserts! (>= current-liquidity u1000000) ERR-INSUFFICIENT-LIQUIDITY) ;; Minimum 1 USDC

    ;; Calculate 90% of total liquidity
    ;; 90% = 9000 / 10000
    (let
      (
        (amount-to-deposit (/ (* current-liquidity u9000) u10000))
        (remaining-liquidity (- current-liquidity amount-to-deposit))
      )
      (asserts! (> amount-to-deposit u0) ERR-INSUFFICIENT-IDLE-LIQUIDITY)

      ;; Transfer USDC to yield source (mock-zest-vault)
      ;; The vault will mint zUSDC shares to this contract
      ;; Use as-contract so multi-outcome-pool becomes tx-sender for USDC transfer
      (try! (as-contract (contract-call? .mock-zest-vault supply amount-to-deposit tx-sender)))

      ;; Update total liquidity - reduce by 90%
      (var-set total-liquidity remaining-liquidity)

      ;; Track deposited amount
      (var-set deposited-to-yield amount-to-deposit)

      (print
        {
          event: "idle-funds-deposited",
          amount: amount-to-deposit,
          remaining-liquidity: remaining-liquidity,
          yield-source: .mock-zest-vault
        }
      )
      (ok amount-to-deposit)
    )
  )
)

;; Withdraw Yield Funds
;; Withdraws deposited funds from yield source back to pool liquidity
;; Only callable by contract owner after funds have been deposited
(define-public (withdraw-yield-funds)
  (let
    (
      (caller contract-caller)
      (deposited (var-get deposited-to-yield))
      (current-liquidity (var-get total-liquidity))
    )
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)
    (asserts! (> deposited u0) ERR-INSUFFICIENT-LIQUIDITY)

    ;; Calculate amount to withdraw (including any yield earned)
    ;; The vault will return the amount plus yield
    (let
      (
        ;; Get the contract's zUSDC balance from the vault
        (contract-shares (unwrap! (contract-call? .mock-zest-vault get-balance (as-contract tx-sender)) ERR-INSUFFICIENT-LIQUIDITY))
        ;; Withdraw all shares
        (usdc-returned (try! (contract-call? .mock-zest-vault withdraw contract-shares (as-contract tx-sender))))
      )
      ;; Update total liquidity - add back the returned amount
      (var-set total-liquidity (+ current-liquidity usdc-returned))

      ;; Reset deposited amount tracking
      (var-set deposited-to-yield u0)

      (print
        {
          event: "yield-funds-withdrawn",
          amount-withdrawn: usdc-returned,
          new-total-liquidity: (+ current-liquidity usdc-returned),
          yield-source: .mock-zest-vault
        }
      )
      (ok usdc-returned)
    )
  )
)

;; Read-only: Get amount deposited to yield source
(define-read-only (get-deposited-to-yield)
  (ok (var-get deposited-to-yield))
)

;; Read-only: Get available liquidity (on-hand liquidity after any deposits)
;; After deposit-idle-funds, total-liquidity is reduced to the remaining amount
;; So available-liquidity equals total-liquidity (what's on-hand)
;; And we calculate original total as on-hand + deposited
(define-read-only (get-available-liquidity)
  (let
    (
      (on-hand (var-get total-liquidity))
      (deposited (var-get deposited-to-yield))
    )
    (ok {
      total-liquidity: (+ on-hand deposited),
      deposited-to-yield: deposited,
      available-liquidity: on-hand
    })
  )
)
