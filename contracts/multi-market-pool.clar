;; Multi-Market Pool Contract - Binary Prediction Markets
;; Implements pm-AMM (Prediction Market AMM) for multiple simultaneous markets
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
      none
        (err ERR-MARKET-NOT-FOUND)
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
              (yes-price (/ yes-price-8 u100000000)) ;; Convert from 8 decimals to 6
              (no-price (- u1000000 yes-price))
            )
            (ok {
              yes-price: yes-price,
              no-price: no-price,
              total-liquidity: (+ x y)
            })
          )
        )
      none
        (err ERR-MARKET-NOT-FOUND)
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
      none
        (err ERR-MARKET-NOT-FOUND)
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
      none
        (err ERR-MARKET-NOT-FOUND)
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
      none
        (err ERR-MARKET-NOT-FOUND)
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
      none
        (err ERR-MARKET-NOT-FOUND)
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
;; PUBLIC FUNCTIONS - Market Management
;; ============================================================================

;; Create a new prediction market
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

    ;; Get current market count and calculate new market-id
    (let
      (
        (current-count (var-get market-count))
        (market-id (+ current-count u1))
      )

      ;; Check for overflow
      (asserts! (> market-id current-count) ERR-MARKET-ID-OVERFLOW)

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
