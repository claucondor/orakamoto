;; Multi-Market Pool Contract V2 - Binary Prediction Markets
;; Implements pm-AMM (Prediction Market AMM) for multiple simultaneous markets
;;
;; VERSION 2 CHANGES:
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

;; Trading Fee: 1% (100 basis points)
(define-constant TRADING-FEE-BP u100)

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
              (yes-price-8 (contract-call? .pm-amm-core get-yes-price x y L))
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
  (contract-call? .pm-amm-core calculate-swap-out amount-in yes-reserve no-reserve liquidity-param buy-yes)
)

;; Calculate USDC out when selling outcome tokens
(define-read-only (calculate-usdc-out-pmamm
    (token-amount uint)
    (yes-reserve uint)
    (no-reserve uint)
    (liquidity-param uint)
    (sell-yes bool)
  )
  ;; For selling, we reverse the swap
  ;; Calculate required amount-in for the tokens-out
  ;; Then subtract fee
  (let
    (
      ;; Calculate gross USDC out
      (usdc-out-gross
        (contract-call? .pm-amm-core calculate-swap-out token-amount yes-reserve no-reserve liquidity-param (not sell-yes))
      )
      (fee (calculate-fee usdc-out-gross))
    )
    (- usdc-out-gross fee)
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

          ;; Calculate trading fee
          (fee (calculate-fee amount))
          (amount-after-fee (- amount fee))

          ;; Calculate tokens to receive using pm-AMM
          ;; buy-yes = true when outcome is 0 (YES), false when outcome is 1 (NO)
          (tokens-out (calculate-tokens-out-pmamm amount-after-fee yes-reserve no-reserve liquidity-param (is-eq outcome u0)))
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

            ;; Calculate USDC out using pm-AMM (gross, before fee)
            (usdc-out-gross (calculate-usdc-out-pmamm token-amount yes-reserve no-reserve liquidity-param (is-eq outcome u0)))

            ;; Calculate trading fee
            (fee (calculate-fee usdc-out-gross))
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
