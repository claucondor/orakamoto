;; Market Pool Contract - Binary Prediction Market
;; Implements CPMM (Constant Product Market Maker) for binary YES/NO markets

;; Traits
(impl-trait .prediction-market-trait.prediction-market-trait)

;; Constants
(define-constant PRECISION u1000000)
(define-constant TRADING-FEE-BP u100)           ;; 1% total fee
(define-constant LP-FEE-SHARE-BP u7000)         ;; 70% of fees go to LPs
(define-constant CREATOR-FEE-SHARE-BP u1000)    ;; 10% of fees go to creator
(define-constant PROTOCOL-FEE-SHARE-BP u2000)   ;; 20% of fees go to protocol
(define-constant DISPUTE-WINDOW u1008)          ;; ~7 days in blocks (144 blocks/day * 7)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-MARKET-NOT-ACTIVE (err u1001))
(define-constant ERR-MARKET-ALREADY-RESOLVED (err u1002))
(define-constant ERR-DEADLINE-NOT-PASSED (err u1003))
(define-constant ERR-INVALID-OUTCOME (err u1004))
(define-constant ERR-INSUFFICIENT-BALANCE (err u1005))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u1006))
(define-constant ERR-ZERO-AMOUNT (err u1007))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u1008))
(define-constant ERR-ALREADY-CLAIMED (err u1009))
(define-constant ERR-NO-WINNINGS (err u1010))
(define-constant ERR-NOT-INITIALIZED (err u1011))
(define-constant ERR-ALREADY-INITIALIZED (err u1012))
(define-constant ERR-DISPUTE-WINDOW-ACTIVE (err u1013))
(define-constant ERR-DISPUTE-ALREADY-OPENED (err u1014))
(define-constant ERR-DISPUTE-ALREADY-CLOSED (err u1015))

;; Data Variables - Market State
(define-data-var market-question (string-utf8 256) u"")
(define-data-var market-creator principal tx-sender)
(define-data-var market-deadline uint u0)
(define-data-var resolution-deadline uint u0)
(define-data-var creator-collateral uint u0)
(define-data-var is-resolved bool false)
(define-data-var is-disputed bool false)
(define-data-var winning-outcome (optional uint) none)
(define-data-var yes-reserve uint u0)
(define-data-var no-reserve uint u0)
(define-data-var total-liquidity uint u0)
(define-data-var accumulated-fees uint u0)
(define-data-var is-initialized bool false)
(define-data-var resolution-block uint u0)      ;; Block height when market was resolved
(define-data-var dispute-deadline uint u0)    ;; When dispute window ends

;; Data Maps
(define-map lp-balances principal uint)
(define-map outcome-balances { owner: principal, outcome: uint } uint)
(define-map has-claimed principal bool)

;; Initialize market
(define-public (initialize
    (question (string-utf8 256))
    (deadline uint)
    (res-deadline uint)
    (initial-liquidity uint)
  )
  (let
    (
      (caller tx-sender)
    )
    (asserts! (not (var-get is-initialized)) ERR-ALREADY-INITIALIZED)
    (asserts! (> initial-liquidity u0) ERR-ZERO-AMOUNT)
    (asserts! (> deadline block-height) ERR-INVALID-OUTCOME)
    (asserts! (> res-deadline deadline) ERR-INVALID-OUTCOME)

    ;; Transfer initial liquidity from creator
    (try! (contract-call? .mock-usdc transfer initial-liquidity caller (as-contract tx-sender) none))

    ;; Set market parameters
    (var-set market-question question)
    (var-set market-creator caller)
    (var-set market-deadline deadline)
    (var-set resolution-deadline res-deadline)
    (var-set creator-collateral initial-liquidity)

    ;; Split liquidity 50/50 between YES and NO reserves
    (let
      (
        (half-liquidity (/ initial-liquidity u2))
      )
      (var-set yes-reserve half-liquidity)
      (var-set no-reserve half-liquidity)
      (var-set total-liquidity initial-liquidity)

      ;; Mint LP tokens to creator (equal to initial liquidity)
      (map-set lp-balances caller initial-liquidity)
    )

    (var-set is-initialized true)

    (print { event: "market-initialized", creator: caller, question: question, deadline: deadline, initial-liquidity: initial-liquidity })
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
    winning-outcome: (var-get winning-outcome)
  })
)

(define-read-only (get-prices)
  (let
    (
      (yes-res (var-get yes-reserve))
      (no-res (var-get no-reserve))
      (total (+ yes-res no-res))
    )
    (if (is-eq total u0)
      (ok { yes-price: u500000, no-price: u500000 })  ;; 50/50 if no liquidity
      (ok {
        ;; Price_YES = Reserve_NO / (Reserve_YES + Reserve_NO)
        yes-price: (/ (* no-res PRECISION) total),
        ;; Price_NO = Reserve_YES / (Reserve_YES + Reserve_NO)
        no-price: (/ (* yes-res PRECISION) total)
      })
    )
  )
)

(define-read-only (get-reserves)
  (ok {
    yes-reserve: (var-get yes-reserve),
    no-reserve: (var-get no-reserve)
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

;; Get dispute window info - useful for checking when claims will be available
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

;; AMM Math Functions

;; Calculate tokens out for a given amount in (CPMM formula)
;; tokens_out = (reserve_out * amount_in) / (reserve_in + amount_in)
(define-read-only (calculate-tokens-out (amount-in uint) (reserve-in uint) (reserve-out uint))
  (if (or (is-eq amount-in u0) (is-eq reserve-in u0) (is-eq reserve-out u0))
    u0
    (/ (* reserve-out amount-in) (+ reserve-in amount-in))
  )
)

;; Calculate amount needed to receive a certain number of tokens
(define-read-only (calculate-amount-in (tokens-out uint) (reserve-in uint) (reserve-out uint))
  (if (or (is-eq tokens-out u0) (>= tokens-out reserve-out))
    u0
    (+ (/ (* reserve-in tokens-out) (- reserve-out tokens-out)) u1)
  )
)

;; Calculate fee from amount
(define-read-only (calculate-fee (amount uint))
  (/ (* amount TRADING-FEE-BP) u10000)
)

;; Add Liquidity
;; Deposits USDC and splits 50/50 between YES/NO reserves
;; Returns LP tokens proportional to share of pool
(define-public (add-liquidity (amount uint))
  (let
    (
      (caller tx-sender)
      (current-total (var-get total-liquidity))
      (yes-res (var-get yes-reserve))
      (no-res (var-get no-reserve))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Transfer USDC from user to contract
    (try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

    ;; Calculate LP tokens to mint
    (let
      (
        (lp-tokens-to-mint
          (if (is-eq current-total u0)
            amount  ;; First deposit gets 1:1 LP tokens
            (/ (* amount current-total) (+ yes-res no-res))
          )
        )
        (half-amount (/ amount u2))
        (current-lp-balance (default-to u0 (map-get? lp-balances caller)))
      )
      ;; Update reserves (split 50/50)
      (var-set yes-reserve (+ yes-res half-amount))
      (var-set no-reserve (+ no-res half-amount))
      (var-set total-liquidity (+ current-total lp-tokens-to-mint))

      ;; Mint LP tokens
      (map-set lp-balances caller (+ current-lp-balance lp-tokens-to-mint))

      (print { event: "liquidity-added", provider: caller, amount: amount, lp-tokens: lp-tokens-to-mint })
      (ok lp-tokens-to-mint)
    )
  )
)

;; Remove Liquidity
;; Burns LP tokens and returns proportional share of reserves plus accumulated fees
(define-public (remove-liquidity (lp-amount uint))
  (let
    (
      (caller tx-sender)
      (current-lp-balance (default-to u0 (map-get? lp-balances caller)))
      (current-total-lp (var-get total-liquidity))
      (yes-res (var-get yes-reserve))
      (no-res (var-get no-reserve))
      (current-fees (var-get accumulated-fees))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (> lp-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= lp-amount current-lp-balance) ERR-INSUFFICIENT-BALANCE)
    (asserts! (> current-total-lp u0) ERR-INSUFFICIENT-LIQUIDITY)

    ;; Calculate proportional share of reserves
    ;; share = lp-amount / total-lp
    ;; usdc-from-reserves = (yes-reserve + no-reserve) * share
    (let
      (
        (total-reserves (+ yes-res no-res))
        ;; Calculate proportional USDC from reserves
        (usdc-from-reserves (/ (* total-reserves lp-amount) current-total-lp))
        ;; Calculate proportional share of LP fees (70% of accumulated fees)
        (lp-fee-pool (/ (* current-fees LP-FEE-SHARE-BP) u10000))
        (fee-share (/ (* lp-fee-pool lp-amount) current-total-lp))
        ;; Total to return
        (total-return (+ usdc-from-reserves fee-share))
        ;; Calculate how much to deduct from each reserve (proportional)
        (yes-to-remove (/ (* yes-res lp-amount) current-total-lp))
        (no-to-remove (/ (* no-res lp-amount) current-total-lp))
      )
      ;; Update state
      (var-set yes-reserve (- yes-res yes-to-remove))
      (var-set no-reserve (- no-res no-to-remove))
      (var-set total-liquidity (- current-total-lp lp-amount))
      (var-set accumulated-fees (- current-fees fee-share))

      ;; Burn LP tokens
      (map-set lp-balances caller (- current-lp-balance lp-amount))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .mock-usdc transfer total-return tx-sender caller none)))

      (print {
        event: "liquidity-removed",
        provider: caller,
        lp-tokens-burned: lp-amount,
        usdc-returned: usdc-from-reserves,
        fee-share: fee-share,
        total-returned: total-return
      })
      (ok { usdc-returned: usdc-from-reserves, fee-share: fee-share })
    )
  )
)

;; Buy Outcome Tokens
;; outcome: 0 = YES, 1 = NO
;; amount: USDC to spend
;; min-tokens-out: minimum tokens to receive (slippage protection)
(define-public (buy-outcome (outcome uint) (amount uint) (min-tokens-out uint))
  (let
    (
      (caller tx-sender)
      (yes-res (var-get yes-reserve))
      (no-res (var-get no-reserve))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (< block-height (var-get market-deadline)) ERR-MARKET-NOT-ACTIVE)
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Calculate fee
    (let
      (
        (fee (calculate-fee amount))
        (amount-after-fee (- amount fee))
        ;; Calculate tokens to receive based on outcome
        (tokens-out
          (if (is-eq outcome u0)
            ;; Buying YES: use NO reserve as reserve-out
            (calculate-tokens-out amount-after-fee yes-res no-res)
            ;; Buying NO: use YES reserve as reserve-out
            (calculate-tokens-out amount-after-fee no-res yes-res)
          )
        )
      )
      (asserts! (>= tokens-out min-tokens-out) ERR-SLIPPAGE-TOO-HIGH)

      ;; Transfer USDC from user to contract
      (try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

      ;; Update reserves and fees
      (if (is-eq outcome u0)
        (begin
          ;; Buying YES: add to YES reserve, remove from NO reserve
          (var-set yes-reserve (+ yes-res amount-after-fee))
          (var-set no-reserve (- no-res tokens-out))
        )
        (begin
          ;; Buying NO: add to NO reserve, remove from YES reserve
          (var-set no-reserve (+ no-res amount-after-fee))
          (var-set yes-reserve (- yes-res tokens-out))
        )
      )

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

;; Sell Outcome Tokens
;; outcome: 0 = YES, 1 = NO
;; token-amount: outcome tokens to sell
;; min-usdc-out: minimum USDC to receive (slippage protection)
(define-public (sell-outcome (outcome uint) (token-amount uint) (min-usdc-out uint))
  (let
    (
      (caller tx-sender)
      (yes-res (var-get yes-reserve))
      (no-res (var-get no-reserve))
      (current-balance (default-to u0 (map-get? outcome-balances { owner: caller, outcome: outcome })))
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (< block-height (var-get market-deadline)) ERR-MARKET-NOT-ACTIVE)
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)
    (asserts! (> token-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= token-amount current-balance) ERR-INSUFFICIENT-BALANCE)

    ;; Calculate USDC to receive based on outcome
    (let
      (
        (usdc-out-gross
          (if (is-eq outcome u0)
            ;; Selling YES: tokens go back to NO reserve, get USDC from YES reserve
            (calculate-tokens-out token-amount no-res yes-res)
            ;; Selling NO: tokens go back to YES reserve, get USDC from NO reserve
            (calculate-tokens-out token-amount yes-res no-res)
          )
        )
        (fee (calculate-fee usdc-out-gross))
        (usdc-out-net (- usdc-out-gross fee))
      )
      (asserts! (>= usdc-out-net min-usdc-out) ERR-SLIPPAGE-TOO-HIGH)

      ;; Update reserves
      (if (is-eq outcome u0)
        (begin
          ;; Selling YES: add tokens back to NO reserve, remove USDC from YES reserve
          (var-set no-reserve (+ no-res token-amount))
          (var-set yes-reserve (- yes-res usdc-out-gross))
        )
        (begin
          ;; Selling NO: add tokens back to YES reserve, remove USDC from NO reserve
          (var-set yes-reserve (+ yes-res token-amount))
          (var-set no-reserve (- no-res usdc-out-gross))
        )
      )

      ;; Accumulate fees
      (var-set accumulated-fees (+ (var-get accumulated-fees) fee))

      ;; Debit outcome tokens from user
      (map-set outcome-balances { owner: caller, outcome: outcome } (- current-balance token-amount))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .mock-usdc transfer usdc-out-net tx-sender caller none)))

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
    )
    (asserts! (var-get is-initialized) ERR-NOT-INITIALIZED)
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get is-resolved)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (>= block-height (var-get market-deadline)) ERR-DEADLINE-NOT-PASSED)
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)

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
      (try! (as-contract (contract-call? .mock-usdc transfer winner-balance tx-sender caller none)))

      (print { event: "winnings-claimed", winner: caller, amount: winner-balance })
      (ok winner-balance)
    )
  )
)

;; Open Dispute
;; Only creator can open dispute immediately after resolution (before finalizing)
;; Blocks claims during dispute window
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
    ;; Dispute can only be opened by creator, after resolution, before finalization
    ;; (finalization happens automatically after dispute window, or via finalize-resolution)
    (asserts! (is-eq caller (var-get market-creator)) ERR-NOT-AUTHORIZED)

    ;; Mark market as disputed
    (var-set is-disputed true)

    ;; Set dispute deadline (same as resolution deadline for now)
    (var-set dispute-deadline (+ (var-get resolution-block) DISPUTE-WINDOW))

    ;; Mint dispute tokens to creator for staking
    ;; Dispute tokens can be burned by loser or used to finalize
    (map-set lp-balances caller (+ (default-to u0 (map-get? lp-balances caller)) stake-amount))

    (print { event: "dispute-opened", opener: caller, winning-outcome: winning, stake-amount: stake-amount })
    (ok stake-amount)
  )
)

;; Finalize Resolution
;; Called after dispute window passes (either automatically or manually by creator)
;; If no dispute was opened, this is the same as resolve
;; If dispute was opened but not resolved by DAO, this can revert to original outcome
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

    ;; Check if dispute was opened and what to do
    (if (var-get is-disputed)
      ;; If disputed, check if we're in the original timeframe or after dispute window
      (if (or (is-none approve-dispute) (is-eq (unwrap! approve-dispute ERR-MARKET-NOT-ACTIVE) false))
        (begin
          ;; Revert to original resolution (creator's choice wins)
          (var-set is-disputed false)
          (print { event: "dispute-reverted", reverter: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
          (ok { reverted: true, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        )
        (begin
          ;; Dispute approved - original resolution stands
          (var-set is-disputed false)
          (print { event: "dispute-finalized", approver: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
          (ok { reverted: false, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        )
      )
      ;; No dispute was opened - simply finalize
      (begin
        (var-set is-disputed false)
        (print { event: "resolution-finalized", finalizer: caller, winning-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
        (ok { reverted: false, final-outcome: (unwrap! winning ERR-MARKET-NOT-ACTIVE) })
      )
    )
  )
)

;; Get Dispute Status
;; Returns information about whether a dispute was opened and when it ends
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
