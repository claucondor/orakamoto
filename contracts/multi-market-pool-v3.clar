;; Multi-Market Pool Contract V2 - Binary Prediction Markets
;; Implements pm-AMM (Prediction Market AMM) for multiple simultaneous markets
;;
;; VERSION 3 CHANGES:
;; - Fixed block-height to stacks-block-height for Clarity 3 Nakamoto compatibility
;; - Added Guardian recovery mechanism for unhealthy/corrupted markets
;; - Added emergency withdrawal for LPs from unhealthy markets
;;
;; Based on:
;; - ALEX Trading Pool Architecture (Single Vault Multi-Pool)
;; - SIP-013 Semi-Fungible Token Standard (for LP tokens)
;; - pm-AMM Core from Paradigm Research
;;
;; Key Design:
;; - Single vault (USDCx) handles all assets
;; - Multiple markets identified by market-id
;; - LP tokens are SIP-013 tokens (token-id = market-id)
;; - YES/NO outcome tokens tracked as internal maps (gas efficient)
;;
;; Clarity Version: 3

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Precision for fixed-point calculations
(define-constant PRECISION u1000000)

;; Trading Fee: 3% base (300 basis points), exponentially scaled to 20% max (matching academic paper)
(define-constant TRADING-FEE-BP u100)

;; Maximum Fee Cap: 20% (2000 basis points) - for exponential time-based fees
(define-constant MAX-FEE-BP u2000)

;; Fee Distribution (must sum to 10000)
;; 70% of fees go to LPs
(define-constant LP-FEE-SHARE-BP u7000)
;; 10% of fees go to market creator
(define-constant CREATOR-FEE-SHARE-BP u1000)
;; 20% of fees go to protocol
(define-constant PROTOCOL-FEE-SHARE-BP u2000)

;; Dispute window for claims (~45 min for hackathon, normally u1008 for ~7 days)
(define-constant DISPUTE-WINDOW u5)

;; Minimum initial liquidity for creating a market (1 USDC = 1000000)
(define-constant MINIMUM-INITIAL-LIQUIDITY u1000000)

;; Minimum liquidity to add/remove (0.1 USDC)
(define-constant MINIMUM-LIQUIDITY u100000)

;; Recovery window for emergency withdrawals (~30 days in fast blocks)
;; 30 days * 24 hours * 60 min * 6 blocks/min = 259200 blocks
(define-constant RECOVERY-WINDOW u259200)

;; ============================================================================
;; IMPORTANT: Contract References
;; ============================================================================
;; DO NOT use constants for contract references - causes Unchecked(ContractCallExpectName)
;; Use direct references in contract-call?: .usdcx, .sip013-lp-token, .pm-amm-core
;;
;; Simnet/Devnet: Use local contract references (.usdcx, .sip013-lp-token)
;; Testnet: Update to deployed principals
;; Mainnet: Update to deployed principals
;; ============================================================================

;; ============================================================================
;; ERROR CONSTANTS
;; ============================================================================

;; General Errors (u4000-u4099)
(define-constant ERR-MARKET-NOT-FOUND (err u4000))
(define-constant ERR-MARKET-NOT-ACTIVE (err u4001))
(define-constant ERR-MARKET-ALREADY-RESOLVED (err u4002))
(define-constant ERR-DEADLINE-NOT-PASSED (err u4003))
(define-constant ERR-INVALID-OUTCOME (err u4004))
(define-constant ERR-INSUFFICIENT-BALANCE (err u4005))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u4006))
(define-constant ERR-ZERO-AMOUNT (err u4007))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u4008))
(define-constant ERR-ALREADY-CLAIMED (err u4009))
(define-constant ERR-NO-WINNINGS (err u4010))
(define-constant ERR-DISPUTE-WINDOW-ACTIVE (err u4011))
(define-constant ERR-INVALID-QUESTION (err u4012))
(define-constant ERR-INVALID-DEADLINE (err u4013))
(define-constant ERR-MARKET-ID_OVERFLOW (err u4014))
(define-constant ERR-NOT-AUTHORIZED (err u4015))

;; Guardian/Recovery Errors (u4100-u4199)
(define-constant ERR-NOT-GUARDIAN (err u4100))
(define-constant ERR-MARKET-NOT-UNHEALTHY (err u4101))
(define-constant ERR-RECOVERY-WINDOW-NOT-PASSED (err u4102))
(define-constant ERR-MARKET-ALREADY-UNHEALTHY (err u4103))
(define-constant ERR-NO-LP-TOKENS (err u4104))
(define-constant ERR-ALREADY-EMERGENCY-WITHDRAWN (err u4105))
(define-constant ERR-NO-FEES (err u4016))

;; ============================================================================
;; DATA STRUCTURES
;; ============================================================================

;; Market counter - used to generate unique market IDs
(define-data-var market-count uint u0)

;; Guardian principal - can mark markets as unhealthy
(define-data-var guardian principal tx-sender)

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
    ;; YES token reserve (USDCx with 6 decimals)
    yes-reserve: uint,
    ;; NO token reserve (USDCx with 6 decimals)
    no-reserve: uint,
    ;; Total liquidity (LP tokens)
    total-liquidity: uint,
    ;; Accumulated trading fees
    accumulated-fees: uint,
    ;; Whether market is resolved
    is-resolved: bool,
    ;; Winning outcome (0 = YES, 1 = NO)
    winning-outcome: (optional uint),
    ;; Block height when market was resolved
    resolution-block: uint,
    ;; Block height when market was created
    created-at: uint,
    ;; Initial liquidity parameter L for pm-AMM
    liquidity-parameter: uint,
  }
)

;; Track unhealthy markets
;; Key: market-id
;; Value: block height when marked unhealthy
(define-map unhealthy-markets uint uint)

;; Track emergency withdrawals
;; Key: { market-id, owner }
;; Value: bool (true = has withdrawn)
(define-map emergency-withdrawn
  { market-id: uint, owner: principal }
  bool
)

;; Outcome balances - tracks YES/NO positions for each user
;; Key: { market-id, owner, outcome }
;; Value: balance (uint)
;; outcome: 0 = YES, 1 = NO
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
;; READ-ONLY FUNCTIONS - Guardian Queries
;; ============================================================================

;; Get current guardian
(define-read-only (get-guardian)
  (ok (var-get guardian))
)

;; Check if a market is unhealthy
(define-read-only (is-unhealthy (market-id uint))
  (match (map-get? unhealthy-markets market-id)
    marked-block (ok true)
    (ok false)
  )
)

;; Get unhealthy market details
(define-read-only (get-unhealthy-details (market-id uint))
  (match (map-get? unhealthy-markets market-id)
    marked-block
      (ok {
        is-unhealthy: true,
        marked-at-block: marked-block,
        recovery-window-ends: (+ marked-block RECOVERY-WINDOW),
        can-emergency-withdraw: (>= stacks-block-height (+ marked-block RECOVERY-WINDOW))
      })
    (ok {
      is-unhealthy: false,
      marked-at-block: u0,
      recovery-window-ends: u0,
      can-emergency-withdraw: false
    })
  )
)

;; Check if user has already emergency withdrawn
(define-read-only (has-emergency-withdrawn (market-id uint) (owner principal))
  (default-to false (map-get? emergency-withdrawn { market-id: market-id, owner: owner }))
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

;; Get prices for a market
;; Returns YES and NO prices based on pm-AMM formula
(define-read-only (get-prices (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (let
          (
            (x (get yes-reserve some-market))
            (y (get no-reserve some-market))
            (L (get liquidity-parameter some-market))
          )
          ;; Use pm-AMM to calculate prices
          ;; price = Phi((y-x)/L) for YES, 1 - price for NO
          (let
            (
              (yes-price-8 (contract-call? .pm-amm-core-v2 get-yes-price x y L))
              (yes-price (/ (* yes-price-8 u1000000) u100000000)) ;; Convert from 8 decimals to 6
              (no-price (- u1000000 yes-price))
            )
            (ok {
              yes-price: yes-price,
              no-price: no-price,
              total-liquidity: (+ x y)
            })
          )
        )
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get reserves for a market
(define-read-only (get-reserves (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok {
          yes-reserve: (get yes-reserve some-market),
          no-reserve: (get no-reserve some-market),
          total-liquidity: (get total-liquidity some-market)
        })
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get outcome token balance for a user
(define-read-only (get-outcome-balance (market-id uint) (owner principal) (outcome uint))
  (ok (default-to u0 (map-get? outcome-balances { market-id: market-id, owner: owner, outcome: outcome })))
)

;; Get LP balance for a user in a market
;; Delegates to SIP-013 LP token contract
(define-read-only (get-lp-balance (market-id uint) (owner principal))
  (contract-call? .sip013-lp-token get-balance market-id owner)
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
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
(define-read-only (is-market-active (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    (match market
      some-market
        (ok (and
          (not (get is-resolved some-market))
          (< stacks-block-height (get deadline some-market))
        ))
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; Get claim status for a user
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
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
            claims-enabled: (and is-resolved (>= stacks-block-height (+ resolution-block DISPUTE-WINDOW))),
            has-claimed: claimed,
            winning-outcome: winning
          })
        )
      ERR-MARKET-NOT-FOUND
    )
  )
)

;; ============================================================================
;; HELPER FUNCTIONS
;; ============================================================================

;; Validate market-id exists
(define-private (market-exists (market-id uint))
  (is-some (map-get? markets market-id))
)

;; Validate outcome is 0 (YES) or 1 (NO)
(define-private (is-valid-outcome (outcome uint))
  (or (is-eq outcome u0) (is-eq outcome u1))
)

;; Calculate fee from amount
(define-read-only (calculate-fee (amount uint))
  (/ (* amount TRADING-FEE-BP) u10000)
)

;; ============================================================================
;; EXPONENTIAL TIME-BASED FEES (V3 FEATURE)
;; ============================================================================

;; Exponential fee multiplier - avoids 32-bit overflow
;; Returns multiplier scaled to u100 (divides by 100 at the end)
;; Formula: multiplier ranges from 1x to 20x where progress from 0 to 1
;; This gives multipliers from 1x to 20x (fees from 3% to 60%, capped at 20%)
;;
;; To avoid overflow: (base_fee * multiplier) / 10000
;; Is calculated as: (base_fee / 100) * (multiplier / 100)
;;
;; This keeps values under 32-bit max:
;; - max base_fee = 30,000 (3% of 1M)
;; - base_fee / 100 = 300
;; - max multiplier = 2000 (20.0 * 100)
;; - multiplier / 100 = 20
;; - 300 * 20 = 6000, capped at max_fee (20% = 200,000)
(define-read-only (get-exp-fee-scaled (created-at uint) (deadline uint))
  (let
    (
      (current-block stacks-block-height)
      (total-duration (- deadline created-at))
      ;; Safe subtraction: if current-block < created-at, elapsed = 0
      (elapsed (if (>= current-block created-at)
        (- current-block created-at)
        u0
      ))
    )
    ;; At or before creation: 1.0x multiplier
    (if (<= elapsed u0)
      u100  ;; 1.0 * 100 = 100
      ;; At or past deadline: 20.0x multiplier
      (if (>= elapsed total-duration)
        u2000  ;; 20.0 * 100 = 2000
        ;; Calculate progress (0 to 100), capped at 100 to handle edge cases
        (let
          (
            (raw-progress (/ (* elapsed u100) total-duration))
            (progress (if (> raw-progress u100) u100 raw-progress))
          )
          ;; Segmented linear approximation of 20^progress using nested if
          (if (<= progress u25)
            ;; 0-25%: 1.0 to 2.11
            (+ u100 (* progress u4))  ;; 100 + 4*progress gives 100 to 200 (approx 1.0 to 2.0x)
            (if (<= progress u50)
              ;; 25-50%: 2.11 to 4.47
              (+ u200 (* (- progress u25) u9))  ;; 200 + 9*(progress-25) gives 200 to 425 (approx 2.0 to 4.25x)
              (if (<= progress u75)
                ;; 50-75%: 4.47 to 9.45
                (+ u425 (* (- progress u50) u20))  ;; 425 + 20*(progress-50) gives 425 to 925 (approx 4.25 to 9.25x)
                ;; 75-100%: 9.45 to 20.0
                (+ u925 (* (- progress u75) u43))  ;; 925 + 43*(progress-75) gives 925 to 2000 (approx 9.25 to 20.0x)
              )
            )
          )
        )
      )
    )
  )
)

;; Calculate time-based fee with exponential multiplier
;; Fee = min(base_fee * scaled_multiplier / 100, max_fee)
;; Base fee: 3% (matching academic paper: LP-PROTECTION-ACADEMIC-PAPER.md)
;; Scaled multiplier ranges from 100 (1.0x) to 2000 (20.0x)
;; Fee range: 3% (start) to 60% (before cap), capped at max_fee = 20% of amount
(define-read-only (calculate-time-based-fee (amount uint) (created-at uint) (deadline uint))
  (let
    (
      ;; Get scaled multiplier (100 to 2000, representing 1.0x to 20.0x)
      (scaled-mult (get-exp-fee-scaled created-at deadline))
      ;; Calculate base fee (3%): amount * 3 / 100 (matching academic paper)
      (base-fee (/ (* amount u3) u100))
      ;; Calculate adjusted fee: base_fee * (scaled_mult / 100)
      ;; This keeps values small: base_fee <= amount*3/100, scaled_mult/100 <= 20
      ;; So max intermediate value is (amount*3/100) * 20 = amount*60/100, capped at 20%
      (adjusted-fee (* base-fee (/ scaled-mult u100)))
      ;; Calculate maximum fee (20% of amount, NOT 20x base-fee!)
      (max-fee (/ (* amount MAX-FEE-BP) u10000))
    )
    ;; Return the lesser of adjusted fee and max fee (fee cap)
    ;; Also cap fee at amount to prevent underflow
    (let ((fee-capped (if (> adjusted-fee max-fee) max-fee adjusted-fee)))
      (if (> fee-capped amount) amount fee-capped)
    )
  )
)

;; Alias for backwards compatibility with tests - returns multiplier in 6-decimal format
;; 1000000 = 1.0x, 5000000 = 5.0x
(define-read-only (get-exp-fee-multiplier (created-at uint) (deadline uint))
  (let
    (
      (scaled (get-exp-fee-scaled created-at deadline))
    )
    (* scaled u10000)  ;; Convert from u100 (100 = 1.0) to 6-decimal (1000000 = 1.0)
  )
)

;; @dev Calculate Dynamic Liquidity Parameter
;; @param L0: Initial liquidity parameter
;; @param created-at: Market creation block
;; @param deadline: Market trading deadline block
;; @return: Dynamic liquidity L(t) that decreases over time
;;
;; Formula from academic paper (Section 3.3):
;; L(t) = L0 * sqrt((T - t) / T)
;;
;; Where:
;; - L0 = initial liquidity parameter
;; - T = total market duration
;; - t = elapsed time
;; - T - t = time remaining
;;
;; Behavior:
;; - At t=0 (creation): L = L0 (normal liquidity)
;; - At t=0.75T (75% through): L = L0 * 0.5 (half liquidity, 2x slippage)
;; - At t=0.99T (99% through): L = L0 * 0.1 (10% liquidity, 10x slippage)
;; - At t=T (deadline): L = 0 (no liquidity, infinite slippage)
(define-read-only (get-dynamic-liquidity-param (L0 uint) (created-at uint) (deadline uint))
  (let
    (
      (current-block stacks-block-height)
      (total-duration (- deadline created-at))
      (time-remaining (if (> deadline current-block) (- deadline current-block) u1))
    )
    ;; L(t) = L0 * sqrt((T - t) / T) = L0 * sqrt(time-remaining / total-duration)
    ;; Prevent division by zero
    (if (or (is-eq total-duration u0) (is-eq time-remaining u0))
      u1  ;; Minimal liquidity at deadline
      (let
        (
          ;; Calculate ratio: time-remaining / total-duration scaled by 100000000 (8 decimals)
          (ratio (/ (* time-remaining u100000000) total-duration))
          ;; Calculate sqrt of ratio using pm-amm-core int-sqrt
          (sqrt-ratio (contract-call? .pm-amm-core-v2 int-sqrt ratio))
          ;; Apply to L0: L(t) = L0 * sqrt-ratio / 10000 (to account for 8-decimal scaling)
          (dynamic-L (/ (* L0 sqrt-ratio) u10000))
        )
        ;; Ensure minimum liquidity to prevent complete breakdown
        (if (< dynamic-L u100) u100 dynamic-L)
      )
    )
  )
)

;; Calculate LP tokens to mint for adding liquidity
;; lp-tokens = (amount * current-total) / (yes-reserve + no-reserve)
(define-read-only (calculate-lp-tokens (amount uint) (yes-reserve uint) (no-reserve uint) (total-liquidity uint))
  (let
    (
      (total-reserves (+ yes-reserve no-reserve))
    )
    (if (is-eq total-liquidity u0)
      amount  ;; First deposit gets 1:1 LP tokens
      (/ (* amount total-liquidity) total-reserves)
    )
  )
)

;; Calculate USDC to return when removing liquidity
;; Returns USDC from reserves + fee share
(define-read-only (calculate-remove-liquidity-return
    (lp-amount uint)
    (yes-reserve uint)
    (no-reserve uint)
    (total-liquidity uint)
    (accumulated-fees uint)
  )
  (let
    (
      (total-reserves (+ yes-reserve no-reserve))
      (usdc-from-reserves (/ (* total-reserves lp-amount) total-liquidity))
      (lp-fee-pool (/ (* accumulated-fees LP-FEE-SHARE-BP) u10000))
      (fee-share (/ (* lp-fee-pool lp-amount) total-liquidity))
    )
    (+ usdc-from-reserves fee-share)
  )
)

;; Split amount 50/50 between YES and NO reserves
(define-private (split-liquidity (amount uint))
  {
    yes-portion: (/ amount u2),
    no-portion: (/ amount u2)
  }
)

;; Calculate tokens out using pm-AMM
(define-read-only (calculate-tokens-out-pmamm
    (amount-in uint)
    (yes-reserve uint)
    (no-reserve uint)
    (liquidity-param uint)
    (buy-yes bool)
  )
  ;; Delegate to pm-amm-core library
  (contract-call? .pm-amm-core-v2 calculate-swap-out amount-in yes-reserve no-reserve liquidity-param buy-yes)
)

;; Calculate USDC out when selling outcome tokens (gross amount, before fees)
(define-read-only (calculate-usdc-out-pmamm
    (token-amount uint)
    (yes-reserve uint)
    (no-reserve uint)
    (liquidity-param uint)
    (sell-yes bool)
  )
  ;; For selling, we reverse the swap
  ;; Note: Fees are calculated separately in sell-outcome using calculate-time-based-fee
  (contract-call? .pm-amm-core-v2 calculate-swap-out token-amount yes-reserve no-reserve liquidity-param (not sell-yes))
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
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (yes-reserve (get yes-reserve market-data))
        (no-reserve (get no-reserve market-data))
        (total-liquidity (get total-liquidity market-data))
        (accumulated-fees (get accumulated-fees market-data))
      )

      ;; Validate LP amount is above minimum
      (asserts! (>= lp-amount MINIMUM-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

      ;; Calculate USDC to return (reserves + fee share)
      (let
        (
          (usdc-return (calculate-remove-liquidity-return lp-amount yes-reserve no-reserve total-liquidity accumulated-fees))
        )

        ;; Burn LP tokens from caller
        (try! (contract-call? .sip013-lp-token burn market-id lp-amount caller))

        ;; Calculate new reserves after removal
        (let
          (
            (total-reserves (+ yes-reserve no-reserve))
            (yes-portion (/ (* yes-reserve lp-amount) total-liquidity))
            (no-portion (/ (* no-reserve lp-amount) total-liquidity))
            (new-yes-reserve (- yes-reserve yes-portion))
            (new-no-reserve (- no-reserve no-portion))
            (new-total-liquidity (- total-liquidity lp-amount))
          )

          ;; Update market data
          (map-set markets market-id
            {
              creator: (get creator market-data),
              question: (get question market-data),
              deadline: (get deadline market-data),
              resolution-deadline: (get resolution-deadline market-data),
              yes-reserve: new-yes-reserve,
              no-reserve: new-no-reserve,
              total-liquidity: new-total-liquidity,
              accumulated-fees: u0, ;; Reset accumulated fees after liquidity removal
              is-resolved: (get is-resolved market-data),
              winning-outcome: (get winning-outcome market-data),
              resolution-block: (get resolution-block market-data),
              created-at: (get created-at market-data),
              liquidity-parameter: (get liquidity-parameter market-data),
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
            yes-portion: yes-portion,
            no-portion: no-portion,
          })

          ;; Return USDC amount
          (ok usdc-return)
        )
      )
    )
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - Guardian Management
;; ============================================================================

;; Set a new guardian (only current guardian can do this)
;; @param new-guardian: The new guardian principal
;; @returns (response bool uint): true on success, error on failure
(define-public (set-guardian (new-guardian principal))
  (begin
    ;; Only current guardian can set a new guardian
    (asserts! (is-eq tx-sender (var-get guardian)) ERR-NOT-GUARDIAN)

    ;; Update guardian
    (var-set guardian new-guardian)

    ;; Emit event
    (print {
      event: "guardian-changed",
      old-guardian: tx-sender,
      new-guardian: new-guardian,
      block: stacks-block-height,
    })

    (ok true)
  )
)

;; Mark a market as unhealthy (only guardian can do this)
;; This starts the recovery window for emergency withdrawals
;; @param market-id: The market to mark as unhealthy
;; @returns (response bool uint): true on success, error on failure
(define-public (mark-unhealthy (market-id uint))
  (let
    (
      (market (map-get? markets market-id))
    )
    ;; Only guardian can mark markets as unhealthy
    (asserts! (is-eq tx-sender (var-get guardian)) ERR-NOT-GUARDIAN)

    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    ;; Validate market is not already marked unhealthy
    (asserts! (is-none (map-get? unhealthy-markets market-id)) ERR-MARKET-ALREADY-UNHEALTHY)

    ;; Mark market as unhealthy with current block height
    (map-set unhealthy-markets market-id stacks-block-height)

    ;; Emit event
    (print {
      event: "market-marked-unhealthy",
      market-id: market-id,
      marked-by: tx-sender,
      marked-at-block: stacks-block-height,
      recovery-window-ends: (+ stacks-block-height RECOVERY-WINDOW),
    })

    (ok true)
  )
)

;; Emergency withdraw for LPs from an unhealthy market
;; Can only be called after the recovery window has passed
;; This allows LPs to recover their funds from a corrupted market
;; @param market-id: The unhealthy market to withdraw from
;; @returns (response uint uint): USDC returned to user on success, error on failure
(define-public (emergency-withdraw (market-id uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
      (marked-block (map-get? unhealthy-markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    ;; Validate market is marked as unhealthy
    (asserts! (is-some marked-block) ERR-MARKET-NOT-UNHEALTHY)

    (let
      (
        (unhealthy-block (unwrap! marked-block ERR-MARKET-NOT-UNHEALTHY))
        (market-data (unwrap! market ERR-MARKET-NOT-FOUND))
        (yes-reserve (get yes-reserve market-data))
        (no-reserve (get no-reserve market-data))
        (total-liquidity (get total-liquidity market-data))
      )

      ;; Validate recovery window has passed
      (asserts! (>= stacks-block-height (+ unhealthy-block RECOVERY-WINDOW)) ERR-RECOVERY-WINDOW-NOT-PASSED)

      ;; Validate user has not already emergency withdrawn
      (asserts! (not (has-emergency-withdrawn market-id caller)) ERR-ALREADY-EMERGENCY-WITHDRAWN)

      ;; Get user's LP balance
      (let
        (
          (lp-balance-result (contract-call? .sip013-lp-token get-balance market-id caller))
          (lp-balance (unwrap! lp-balance-result ERR-INSUFFICIENT-BALANCE))
        )

        ;; Validate user has LP tokens
        (asserts! (> lp-balance u0) ERR-NO-LP-TOKENS)

        ;; Calculate USDC to return (proportional share of reserves)
        ;; Note: In emergency mode, we don't add fee share since market is corrupted
        (let
          (
            (total-reserves (+ yes-reserve no-reserve))
            (usdc-return (if (> total-liquidity u0)
              (/ (* total-reserves lp-balance) total-liquidity)
              u0
            ))
          )

          ;; Mark user as having emergency withdrawn
          (map-set emergency-withdrawn { market-id: market-id, owner: caller } true)

          ;; Burn LP tokens from caller
          (try! (contract-call? .sip013-lp-token burn market-id lp-balance caller))

          ;; Calculate new reserves after removal
          (let
            (
              (yes-portion (if (> total-liquidity u0) (/ (* yes-reserve lp-balance) total-liquidity) u0))
              (no-portion (if (> total-liquidity u0) (/ (* no-reserve lp-balance) total-liquidity) u0))
              (new-yes-reserve (- yes-reserve yes-portion))
              (new-no-reserve (- no-reserve no-portion))
              (new-total-liquidity (- total-liquidity lp-balance))
            )

            ;; Update market data
            (map-set markets market-id
              {
                creator: (get creator market-data),
                question: (get question market-data),
                deadline: (get deadline market-data),
                resolution-deadline: (get resolution-deadline market-data),
                yes-reserve: new-yes-reserve,
                no-reserve: new-no-reserve,
                total-liquidity: new-total-liquidity,
                accumulated-fees: (get accumulated-fees market-data),
                is-resolved: (get is-resolved market-data),
                winning-outcome: (get winning-outcome market-data),
                resolution-block: (get resolution-block market-data),
                created-at: (get created-at market-data),
                liquidity-parameter: (get liquidity-parameter market-data),
              }
            )

            ;; Transfer USDC to caller (if any)
            (if (> usdc-return u0)
              (try! (as-contract (contract-call? .usdcx transfer usdc-return tx-sender caller none)))
              true
            )

            ;; Emit event
            (print {
              event: "emergency-withdrawal",
              market-id: market-id,
              withdrawer: caller,
              lp-burned: lp-balance,
              usdc-returned: usdc-return,
              block: stacks-block-height,
            })

            ;; Return USDC amount
            (ok usdc-return)
          )
        )
      )
    )
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - Market Management
;; ============================================================================

;; Create a new prediction market
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
;; @param question: The market question (max 256 UTF-8 bytes)
;; @param deadline: Trading deadline (block height)
;; @param resolution-deadline: Resolution deadline (block height)
;; @param initial-liquidity: Initial liquidity in USDCx (min 1 USDC)
;; @returns (response uint uint): The market-id on success, error code on failure
(define-public (create-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline uint)
    (initial-liquidity uint)
  )
  (let
    (
      (caller tx-sender)
      (current-block stacks-block-height)
    )
    ;; Validate question is not empty
    (asserts! (> (len question) u0) ERR-INVALID-QUESTION)

    ;; Validate deadline is in the future
    (asserts! (> deadline current-block) ERR-INVALID-DEADLINE)

    ;; Validate resolution-deadline is after deadline
    (asserts! (> resolution-deadline deadline) ERR-INVALID-DEADLINE)

    ;; Validate minimum initial liquidity
    (asserts! (>= initial-liquidity MINIMUM-INITIAL-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

    ;; Get current market count and calculate new market-id
    (let
      (
        (current-count (var-get market-count))
        (market-id (+ current-count u1))
      )

      ;; Transfer USDCx from creator to contract
      (try! (contract-call? .usdcx transfer initial-liquidity caller (as-contract tx-sender) none))

      ;; Split liquidity 50/50 for YES and NO reserves
      (let
        (
          (split-amount (split-liquidity initial-liquidity))
          (yes-portion (get yes-portion split-amount))
          (no-portion (get no-portion split-amount))
        )

        ;; Create market entry
        (map-set markets market-id
          {
            creator: caller,
            question: question,
            deadline: deadline,
            resolution-deadline: resolution-deadline,
            yes-reserve: yes-portion,
            no-reserve: no-portion,
            total-liquidity: initial-liquidity,
            accumulated-fees: u0,
            is-resolved: false,
            winning-outcome: none,
            resolution-block: u0,
            created-at: current-block,
            liquidity-parameter: initial-liquidity, ;; L = initial liquidity for pm-AMM
          }
        )

        ;; Initialize fee maps
        (map-set creator-fees market-id u0)
        (map-set protocol-fees market-id u0)

        ;; Mint LP tokens to creator
        (try! (contract-call? .sip013-lp-token mint market-id initial-liquidity caller))

        ;; Increment market count
        (var-set market-count market-id)

        ;; Emit event
        (print {
          event: "market-created",
          market-id: market-id,
          creator: caller,
          question: question,
          deadline: deadline,
          resolution-deadline: resolution-deadline,
          initial-liquidity: initial-liquidity,
          liquidity-parameter: initial-liquidity,
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
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
      )
      ;; Validate market is not resolved
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)

      ;; Validate amount is above minimum
      (asserts! (>= amount MINIMUM-LIQUIDITY) ERR-INSUFFICIENT-LIQUIDITY)

      ;; Transfer USDCx from user to contract
      (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

      ;; Split liquidity 50/50 for YES and NO reserves
      (let
        (
          (split-amount (split-liquidity amount))
          (yes-portion (get yes-portion split-amount))
          (no-portion (get no-portion split-amount))
          (old-yes-reserve (get yes-reserve market-data))
          (old-no-reserve (get no-reserve market-data))
          (old-total-liquidity (get total-liquidity market-data))
        )

        ;; Calculate LP tokens to mint (proportional)
        (let
          (
            (lp-tokens (calculate-lp-tokens amount old-yes-reserve old-no-reserve old-total-liquidity))
          )

          ;; Update market reserves
          (map-set markets market-id
            {
              creator: (get creator market-data),
              question: (get question market-data),
              deadline: (get deadline market-data),
              resolution-deadline: (get resolution-deadline market-data),
              yes-reserve: (+ old-yes-reserve yes-portion),
              no-reserve: (+ old-no-reserve no-portion),
              total-liquidity: (+ old-total-liquidity amount),
              accumulated-fees: (get accumulated-fees market-data),
              is-resolved: (get is-resolved market-data),
              winning-outcome: (get winning-outcome market-data),
              resolution-block: (get resolution-block market-data),
              created-at: (get created-at market-data),
              liquidity-parameter: (get liquidity-parameter market-data),
            }
          )

          ;; Mint LP tokens to user
          (try! (contract-call? .sip013-lp-token mint market-id lp-tokens caller))

          ;; Emit event
          (print {
            event: "liquidity-added",
            market-id: market-id,
            provider: caller,
            amount: amount,
            lp-tokens: lp-tokens,
            yes-portion: yes-portion,
            no-portion: no-portion,
          })

          ;; Return LP tokens minted
          (ok lp-tokens)
        )
      )
    )
  )
)

;; Buy outcome tokens from a market
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
;; @param market-id: The market to buy from
;; @param outcome: 0 = YES, 1 = NO
;; @param amount: USDCx amount to spend
;; @param min-tokens-out: Minimum tokens to receive (slippage protection)
;; @returns (response uint uint): Tokens received on success, error code on failure
(define-public (buy-outcome
    (market-id uint)
    (outcome uint)
    (amount uint)
    (min-tokens-out uint)
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
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
        (created-at (get created-at market-data))
      )
      ;; Validate market is active (not resolved and before deadline)
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)
      (asserts! (< stacks-block-height deadline) ERR-MARKET-NOT-ACTIVE)

      ;; Validate outcome is 0 (YES) or 1 (NO)
      (asserts! (is-valid-outcome outcome) ERR-INVALID-OUTCOME)

      ;; Validate amount is above zero
      (asserts! (> amount u0) ERR-ZERO-AMOUNT)

      ;; Get current reserves and liquidity parameter
      (let
        (
          (yes-reserve (get yes-reserve market-data))
          (no-reserve (get no-reserve market-data))
          (liquidity-param (get liquidity-parameter market-data))

          ;; Apply Dynamic Liquidity mechanism (Academic Paper Section 3.3)
          ;; Liquidity decreases over time: L(t) = L0 * sqrt((T-t)/T)
          ;; This increases slippage as market approaches deadline
          ;; capturing extra value from late informed traders
          (effective-liquidity (get-dynamic-liquidity-param liquidity-param created-at deadline))

          ;; Calculate time-based exponential trading fee
          (fee (calculate-time-based-fee amount created-at deadline))
          (amount-after-fee (- amount fee))

          ;; Calculate tokens to receive using pm-AMM with dynamic liquidity
          ;; buy-yes = true when outcome is 0 (YES), false when outcome is 1 (NO)
          ;; Using effective-liquidity applies the slippage multiplier
          (tokens-out-raw (calculate-tokens-out-pmamm amount-after-fee yes-reserve no-reserve effective-liquidity (is-eq outcome u0)))

          ;; Ensure tokens-out doesn't exceed available reserve (safety check)
          (max-available (if (is-eq outcome u0) no-reserve yes-reserve))
          (tokens-out (if (> tokens-out-raw max-available) max-available tokens-out-raw))
        )
        ;; Validate slippage protection
        (asserts! (>= tokens-out min-tokens-out) ERR-SLIPPAGE-TOO-HIGH)

        ;; Transfer USDCx from user to contract
        (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

        ;; Calculate new reserves after the trade
        ;; For buy-yes (outcome=0): YES reserve increases, NO reserve decreases by tokens-out
        ;; For buy-no (outcome=1): NO reserve increases, YES reserve decreases by tokens-out
        (let
          (
            (new-yes-reserve (if (is-eq outcome u0)
              (+ yes-reserve amount-after-fee)  ;; Buying YES: YES reserve grows
              (- yes-reserve tokens-out)         ;; Buying NO: YES reserve shrinks
            ))
            (new-no-reserve (if (is-eq outcome u0)
              (- no-reserve tokens-out)          ;; Buying YES: NO reserve shrinks
              (+ no-reserve amount-after-fee)   ;; Buying NO: NO reserve grows
            ))
            (new-accumulated-fees (+ (get accumulated-fees market-data) fee))
          )
          ;; Update market data
          (map-set markets market-id
            {
              creator: (get creator market-data),
              question: (get question market-data),
              deadline: (get deadline market-data),
              resolution-deadline: (get resolution-deadline market-data),
              yes-reserve: new-yes-reserve,
              no-reserve: new-no-reserve,
              total-liquidity: (get total-liquidity market-data),
              accumulated-fees: new-accumulated-fees,
              is-resolved: (get is-resolved market-data),
              winning-outcome: (get winning-outcome market-data),
              resolution-block: (get resolution-block market-data),
              created-at: (get created-at market-data),
              liquidity-parameter: (get liquidity-parameter market-data),
            }
          )

          ;; Update creator and protocol fee maps
          (let
            (
              (creator-fee-portion (/ (* fee CREATOR-FEE-SHARE-BP) u10000))
              (protocol-fee-portion (/ (* fee PROTOCOL-FEE-SHARE-BP) u10000))
              (old-creator-fees (default-to u0 (map-get? creator-fees market-id)))
              (old-protocol-fees (default-to u0 (map-get? protocol-fees market-id)))
            )
            (map-set creator-fees market-id (+ old-creator-fees creator-fee-portion))
            (map-set protocol-fees market-id (+ old-protocol-fees protocol-fee-portion))

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
                new-yes-reserve: new-yes-reserve,
                new-no-reserve: new-no-reserve,
              })

              ;; Return tokens received
              (ok tokens-out)
            )
          )
        )
      )
    )
  )
)

;; Sell outcome tokens back to the market
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
;; @param market-id: The market to sell to
;; @param outcome: 0 = YES, 1 = NO
;; @param token-amount: Number of outcome tokens to sell
;; @param min-usdc-out: Minimum USDC to receive (slippage protection)
;; @returns (response uint uint): USDC received on success, error code on failure
(define-public (sell-outcome
    (market-id uint)
    (outcome uint)
    (token-amount uint)
    (min-usdc-out uint)
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
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
        (created-at (get created-at market-data))
      )
      ;; Validate market is active (not resolved and before deadline)
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)
      (asserts! (< stacks-block-height deadline) ERR-MARKET-NOT-ACTIVE)

      ;; Validate outcome is 0 (YES) or 1 (NO)
      (asserts! (is-valid-outcome outcome) ERR-INVALID-OUTCOME)

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

        ;; Get current reserves and liquidity parameter
        (let
          (
            (yes-reserve (get yes-reserve market-data))
            (no-reserve (get no-reserve market-data))
            (liquidity-param (get liquidity-parameter market-data))

            ;; Apply Dynamic Liquidity mechanism (same as buy-outcome)
            (effective-liquidity (get-dynamic-liquidity-param liquidity-param created-at deadline))

            ;; Calculate USDC out using pm-AMM with dynamic liquidity (gross, before fee)
            (usdc-out-gross (calculate-usdc-out-pmamm token-amount yes-reserve no-reserve effective-liquidity (is-eq outcome u0)))

            ;; Calculate time-based exponential trading fee
            (fee (calculate-time-based-fee usdc-out-gross created-at deadline))
            (usdc-out-net (- usdc-out-gross fee))
          )
          ;; Validate slippage protection
          (asserts! (>= usdc-out-net min-usdc-out) ERR-SLIPPAGE-TOO-HIGH)

          ;; Calculate new reserves after the trade
          ;; For sell-yes (outcome=0): YES reserve decreases, NO reserve increases by usdc-out-net
          ;; For sell-no (outcome=1): NO reserve decreases, YES reserve increases by usdc-out-net
          (let
            (
              (new-yes-reserve (if (is-eq outcome u0)
                (- yes-reserve token-amount)         ;; Selling YES: YES reserve shrinks
                (+ yes-reserve usdc-out-net)        ;; Selling NO: YES reserve grows
              ))
              (new-no-reserve (if (is-eq outcome u0)
                (+ no-reserve usdc-out-net)         ;; Selling YES: NO reserve grows
                (- no-reserve token-amount)         ;; Selling NO: NO reserve shrinks
              ))
              (new-accumulated-fees (+ (get accumulated-fees market-data) fee))
            )
            ;; Update market data
            (map-set markets market-id
              {
                creator: (get creator market-data),
                question: (get question market-data),
                deadline: (get deadline market-data),
                resolution-deadline: (get resolution-deadline market-data),
                yes-reserve: new-yes-reserve,
                no-reserve: new-no-reserve,
                total-liquidity: (get total-liquidity market-data),
                accumulated-fees: new-accumulated-fees,
                is-resolved: (get is-resolved market-data),
                winning-outcome: (get winning-outcome market-data),
                resolution-block: (get resolution-block market-data),
                created-at: (get created-at market-data),
                liquidity-parameter: (get liquidity-parameter market-data),
              }
            )

            ;; Update creator and protocol fee maps
            (let
              (
                (creator-fee-portion (/ (* fee CREATOR-FEE-SHARE-BP) u10000))
                (protocol-fee-portion (/ (* fee PROTOCOL-FEE-SHARE-BP) u10000))
                (old-creator-fees (default-to u0 (map-get? creator-fees market-id)))
                (old-protocol-fees (default-to u0 (map-get? protocol-fees market-id)))
              )
              (map-set creator-fees market-id (+ old-creator-fees creator-fee-portion))
              (map-set protocol-fees market-id (+ old-protocol-fees protocol-fee-portion))

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
                new-yes-reserve: new-yes-reserve,
                new-no-reserve: new-no-reserve,
              })

              ;; Return USDC received
              (ok usdc-out-net)
            )
          )
        )
      )
    )
  )
)

;; Resolve a market by setting the winning outcome
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
;; @param market-id: The market to resolve
;; @param outcome: The winning outcome (0 = YES, 1 = NO)
;; @returns (response bool bool): true on success, error code on failure
(define-public (resolve (market-id uint) (outcome uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (creator (get creator market-data))
        (is-resolved (get is-resolved market-data))
        (deadline (get deadline market-data))
      )
      ;; Validate caller is the market creator
      (asserts! (is-eq caller creator) ERR-NOT-AUTHORIZED)

      ;; Validate market is not already resolved
      (asserts! (not is-resolved) ERR-MARKET-ALREADY-RESOLVED)

      ;; Validate deadline has passed
      (asserts! (>= stacks-block-height deadline) ERR-DEADLINE-NOT-PASSED)

      ;; Validate outcome is 0 (YES) or 1 (NO)
      (asserts! (is-valid-outcome outcome) ERR-INVALID-OUTCOME)

      ;; Resolve the market
      (map-set markets market-id
        {
          creator: creator,
          question: (get question market-data),
          deadline: deadline,
          resolution-deadline: (get resolution-deadline market-data),
          yes-reserve: (get yes-reserve market-data),
          no-reserve: (get no-reserve market-data),
          total-liquidity: (get total-liquidity market-data),
          accumulated-fees: (get accumulated-fees market-data),
          is-resolved: true,
          winning-outcome: (some outcome),
          resolution-block: stacks-block-height,
          created-at: (get created-at market-data),
          liquidity-parameter: (get liquidity-parameter market-data),
        }
      )

      ;; Emit event
      (print {
        event: "market-resolved",
        market-id: market-id,
        resolver: caller,
        winning-outcome: outcome,
        resolution-block: stacks-block-height,
      })

      ;; Return success
      (ok true)
    )
  )
)

;; Claim winnings for a resolved market
;; FIXED: Uses stacks-block-height instead of block-height for Nakamoto compatibility
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
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (is-resolved (get is-resolved market-data))
        (resolution-block (get resolution-block market-data))
        (winning-outcome (get winning-outcome market-data))
      )
      ;; Validate market is resolved
      (asserts! is-resolved ERR-MARKET-NOT-ACTIVE)

      ;; Validate dispute window has passed
      (asserts! (>= stacks-block-height (+ resolution-block DISPUTE-WINDOW)) ERR-DISPUTE-WINDOW-ACTIVE)

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

;; ============================================================================
;; FEE CLAIMING FUNCTIONS
;; ============================================================================

;; Claim accumulated creator fees for a market
;; @param market-id: The market to claim fees from
;; @returns (response uint uint): USDC claimed on success, error code on failure
(define-public (claim-creator-fees (market-id uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    (let
      (
        (market-data (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (creator (get creator market-data))
      )
      ;; Validate caller is the creator
      (asserts! (is-eq caller creator) ERR-NOT-AUTHORIZED)

      ;; Get accumulated creator fees
      (let
        (
          (fees-accrued (default-to u0 (map-get? creator-fees market-id)))
        )
        ;; Validate there are fees to claim
        (asserts! (> fees-accrued u0) ERR-NO-FEES)

        ;; Transfer USDC to creator
        (try! (as-contract (contract-call? .usdcx transfer fees-accrued (as-contract tx-sender) caller none)))

        ;; Reset creator fees
        (map-set creator-fees market-id u0)

        ;; Emit event
        (print {
          event: "creator-fees-claimed",
          market-id: market-id,
          creator: creator,
          amount: fees-accrued,
        })

        ;; Return claimed amount
        (ok fees-accrued)
      )
    )
  )
)

;; Claim accumulated protocol fees for a market
;; @param market-id: The market to claim fees from
;; @returns (response uint uint): USDC claimed on success, error code on failure
(define-public (claim-protocol-fees (market-id uint))
  (let
    (
      (caller tx-sender)
      (market (map-get? markets market-id))
    )
    ;; Validate market exists
    (asserts! (is-some market) ERR-MARKET-NOT-FOUND)

    ;; Validate caller is the guardian
    (asserts! (is-eq caller (var-get guardian)) ERR-NOT-GUARDIAN)

    ;; Get accumulated protocol fees
    (let
      (
        (guardian-val (var-get guardian))
        (fees-accrued (default-to u0 (map-get? protocol-fees market-id)))
      )
      ;; Validate there are fees to claim
      (asserts! (> fees-accrued u0) ERR-NO-FEES)

      ;; Transfer USDC to guardian
      (try! (as-contract (contract-call? .usdcx transfer fees-accrued (as-contract tx-sender) caller none)))

      ;; Reset protocol fees
      (map-set protocol-fees market-id u0)

      ;; Emit event
      (print {
        event: "protocol-fees-claimed",
        market-id: market-id,
        guardian: guardian-val,
        amount: fees-accrued,
      })

      ;; Return claimed amount
      (ok fees-accrued)
    )
  )
)
