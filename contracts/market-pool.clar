;; Market Pool Contract - Binary Prediction Market
;; Implements CPMM (Constant Product Market Maker) for multiple binary YES/NO markets.

;; Traits
(impl-trait .prediction-market-trait.prediction-market-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant TRADING-FEE-BP u100)           ;; 1% total fee
(define-constant LP-FEE-SHARE-BP u7000)         ;; 70% of fees go to LPs
(define-constant CREATOR-FEE-SHARE-BP u1000)    ;; 10% of fees go to creator
(define-constant PROTOCOL-FEE-SHARE-BP u2000)   ;; 20% of fees go to protocol
(define-constant DISPUTE-WINDOW u1008)          ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant DEFAULT-RESOLUTION-WINDOW u1008)

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
(define-constant ERR-MARKET-NOT-FOUND (err u1011))
(define-constant ERR-DISPUTE-WINDOW-ACTIVE (err u1013))
(define-constant ERR-DISPUTE-ALREADY-OPENED (err u1014))
(define-constant ERR-DISPUTE-ALREADY-CLOSED (err u1015))
(define-constant ERR-INVALID-CALLER (err u1016))

;; ---
;; Data Storage
;; ---

;; Market counter
(define-data-var market-count uint u0)

;; Market properties
(define-map markets uint {
  creator: principal,
  question: (string-utf8 256),
  deadline: uint,
  resolution-deadline: uint,
  creator-collateral: uint,
  is-resolved: bool,
  is-disputed: bool,
  winning-outcome: (optional uint),
  yes-reserve: uint,
  no-reserve: uint,
  total-liquidity: uint,
  accumulated-fees: uint,
  resolution-block: uint,
  dispute-deadline: uint,
  active: bool
})

;; Balances
(define-map lp-balances { market-id: uint, user: principal } uint)
(define-map outcome-balances { market-id: uint, user: principal, outcome: uint } uint)
(define-map has-claimed { market-id: uint, user: principal } bool)

;; Creator tracking
(define-map creator-market-count principal uint)
(define-map creator-markets (tuple principal uint) uint)


;; ---
;; Factory Functions (called by market-factory)
;; ---

(define-public (create-market-in-pool (question (string-utf8 256)) (deadline uint) (collateral uint) (creator principal))
  (begin
    (asserts! (is-eq tx-sender (contract-of .market-factory)) ERR-INVALID-CALLER)

    ;; Transfer collateral from creator
    (try! (contract-call? .mock-usdc transfer collateral creator (as-contract tx-sender) none))

    (let ((market-id (var-get market-count)))
      ;; Create market
      (map-set markets market-id {
        creator: creator,
        question: question,
        deadline: deadline,
        resolution-deadline: (+ deadline DEFAULT-RESOLUTION-WINDOW),
        creator-collateral: collateral,
        is-resolved: false,
        is-disputed: false,
        winning-outcome: none,
        yes-reserve: (/ collateral u2),
        no-reserve: (/ collateral u2),
        total-liquidity: collateral,
        accumulated-fees: u0,
        resolution-block: u0,
        dispute-deadline: u0,
        active: true
      })

      ;; Mint initial LP tokens to creator
      (map-set lp-balances { market-id: market-id, user: creator } collateral)

      ;; Track market for creator
      (let ((creator-idx (default-to u0 (map-get? creator-market-count creator))))
        (map-set creator-markets { creator: creator, index: creator-idx } market-id)
        (map-set creator-market-count creator (+ creator-idx u1))
      )

      (var-set market-count (+ market-id u1))
      (print { event: "market-created", id: market-id, creator: creator, question: question })
      (ok market-id)
    )
  )
)

(define-public (deactivate-market (id uint))
    (begin
        (asserts! (is-eq tx-sender (contract-of .market-factory)) ERR-INVALID-CALLER)
        (match (map-get? markets id)
            (some market)
                (ok (map-set markets id (merge market { active: false })))
            (none ERR-MARKET-NOT-FOUND)
        )
    )
)

;; ---
;; Read-Only Functions for Factory
;; ---

(define-read-only (get-market-count)
  (ok (var-get market-count))
)

(define-read-only (get-market (id uint))
  (ok (map-get? markets id))
)

(define-private (get-markets-by-creator-helper (creator principal) (current-index uint) (max-index uint) (market-list (list 200 uint)))
  (if (>= current-index max-index)
    market-list
    (match (map-get? creator-markets { creator: creator, index: current-index })
      (some market-id) (get-markets-by-creator-helper creator (+ current-index u1) max-index (unwrap-panic (as-max-len? (append market-list market-id) u200)))
      (none (get-markets-by-creator-helper creator (+ current-index u1) max-index market-list))
    )
  )
)

(define-read-only (get-creator-markets (creator principal))
  (let ((count (default-to u0 (map-get? creator-market-count creator))))
    (ok (get-markets-by-creator-helper creator u0 count []))
  )
)


;; ---
;; Core Market Functions (now require market-id)
;; ---

(define-read-only (get-market-info (market-id uint))
  (match (map-get? markets market-id)
    (some m) (ok {
      question: (get question m),
      creator: (get creator m),
      deadline: (get deadline m),
      resolution-deadline: (get resolution-deadline m),
      is-resolved: (get is-resolved m),
      winning-outcome: (get winning-outcome m)
    })
    (none ERR-MARKET-NOT-FOUND)
  )
)

(define-read-only (get-prices (market-id uint))
  (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND)))
    (let ((yes-res (get yes-reserve market)) (no-res (get no-reserve market)) (total (+ yes-res no-res)))
      (if (is-eq total u0)
        (ok { yes-price: u500000, no-price: u500000 })
        (ok {
          yes-price: (/ (* no-res PRECISION) total),
          no-price: (/ (* yes-res PRECISION) total)
        })
      )
    )
  )
)

(define-read-only (get-reserves (market-id uint))
    (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND)))
        (ok {
            yes-reserve: (get yes-reserve market),
            no-reserve: (get no-reserve market)
        })
    )
)

(define-public (add-liquidity (market-id uint) (amount uint))
  (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (caller tx-sender))
    (asserts! (get active market) ERR-MARKET-NOT-ACTIVE)
    (asserts! (not (get is-resolved market)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    (try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

    (let ((total-liquidity (get total-liquidity market))
          (yes-res (get yes-reserve market))
          (no-res (get no-reserve market)))
      (let ((lp-minted (if (is-eq total-liquidity u0) amount (/ (* amount total-liquidity) (+ yes-res no-res))))
            (half-amount (/ amount u2)))
        (map-set markets market-id
          (merge market {
            yes-reserve: (+ yes-res half-amount),
            no-reserve: (+ no-res half-amount),
            total-liquidity: (+ total-liquidity lp-minted)
          })
        )
        (map-set lp-balances { market-id: market-id, user: caller } (+ (default-to u0 (map-get? lp-balances { market-id: market-id, user: caller })) lp-minted))
        (print { event: "liquidity-added", market: market-id, provider: caller, amount: amount, lp-tokens: lp-minted })
        (ok lp-minted)
      )
    )
  )
)

(define-public (remove-liquidity (market-id uint) (lp-amount uint))
    (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
          (caller tx-sender)
          (lp-balance (default-to u0 (map-get? lp-balances { market-id: market-id, user: tx-sender }))))
        (asserts! (> lp-amount u0) ERR-ZERO-AMOUNT)
        (asserts! (>= lp-balance lp-amount) ERR-INSUFFICIENT-BALANCE)

        (let ((total-liquidity (get total-liquidity market))
              (total-reserves (+ (get yes-reserve market) (get no-reserve market)))
              (lp-fee-pool (/ (* (get accumulated-fees market) LP-FEE-SHARE-BP) u10000)))
            (asserts! (> total-liquidity u0) ERR-INSUFFICIENT-LIQUIDITY)

            (let ((usdc-from-reserves (/ (* total-reserves lp-amount) total-liquidity))
                  (fee-share (/ (* lp-fee-pool lp-amount) total-liquidity))
                  (total-return (+ usdc-from-reserves fee-share))
                  (yes-to-remove (/ (* (get yes-reserve market) lp-amount) total-liquidity))
                  (no-to-remove (/ (* (get no-reserve market) lp-amount) total-liquidity)))

                (map-set markets market-id
                    (merge market {
                        yes-reserve: (- (get yes-reserve market) yes-to-remove),
                        no-reserve: (- (get no-reserve market) no-to-remove),
                        total-liquidity: (- total-liquidity lp-amount),
                        accumulated-fees: (- (get accumulated-fees market) fee-share)
                    })
                )
                (map-set lp-balances { market-id: market-id, user: caller } (- lp-balance lp-amount))
                (try! (as-contract (contract-call? .mock-usdc transfer total-return tx-sender caller none)))
                (print { event: "liquidity-removed", market: market-id, provider: caller, lp-tokens-burned: lp-amount, usdc-returned: total-return })
                (ok { usdc-returned: usdc-from-reserves, fee-share: fee-share })
            )
        )
    )
)

(define-public (buy-outcome (market-id uint) (outcome uint) (amount uint) (min-tokens-out uint))
    (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
          (caller tx-sender))
        (asserts! (get active market) ERR-MARKET-NOT-ACTIVE)
        (asserts! (not (get is-resolved market)) ERR-MARKET-ALREADY-RESOLVED)
        (asserts! (< block-height (get deadline market)) ERR-DEADLINE-NOT-PASSED)
        (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)
        (asserts! (> amount u0) ERR-ZERO-AMOUNT)

        (let ((fee (/ (* amount TRADING-FEE-BP) u10000))
              (amount-after-fee (- amount fee)))
            (let ((tokens-out (if (is-eq outcome u0)
                                (calculate-tokens-out amount-after-fee (get yes-reserve market) (get no-reserve market))
                                (calculate-tokens-out amount-after-fee (get no-reserve market) (get yes-reserve market)))))
                (asserts! (>= tokens-out min-tokens-out) ERR-SLIPPAGE-TOO-HIGH)
                (try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))
                (map-set markets market-id
                    (if (is-eq outcome u0)
                        (merge market {
                            yes-reserve: (+ (get yes-reserve market) amount-after-fee),
                            no-reserve: (- (get no-reserve market) tokens-out),
                            accumulated-fees: (+ (get accumulated-fees market) fee)
                        })
                        (merge market {
                            no-reserve: (+ (get no-reserve market) amount-after-fee),
                            yes-reserve: (- (get yes-reserve market) tokens-out),
                            accumulated-fees: (+ (get accumulated-fees market) fee)
                        })
                    )
                )
                (let ((balance (default-to u0 (map-get? outcome-balances { market-id: market-id, user: caller, outcome: outcome }))))
                    (map-set outcome-balances { market-id: market-id, user: caller, outcome: outcome } (+ balance tokens-out))
                )
                (print { event: "outcome-bought", market: market-id, buyer: caller, outcome: outcome, amount: amount, tokens-out: tokens-out })
                (ok tokens-out)
            )
        )
    )
)

(define-public (sell-outcome (market-id uint) (outcome uint) (amount uint) (min-usdc-out uint))
    (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
          (caller tx-sender)
          (balance (default-to u0 (map-get? outcome-balances { market-id: market-id, user: caller, outcome: outcome }))))
        (asserts! (get active market) ERR-MARKET-NOT-ACTIVE)
        (asserts! (not (get is-resolved market)) ERR-MARKET-ALREADY-RESOLVED)
        (asserts! (< block-height (get deadline market)) ERR-DEADLINE-NOT-PASSED)
        (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)
        (asserts! (> amount u0) ERR-ZERO-AMOUNT)
        (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)

        (let ((usdc-out-gross (if (is-eq outcome u0)
                                (calculate-tokens-out amount (get no-reserve market) (get yes-reserve market))
                                (calculate-tokens-out amount (get yes-reserve market) (get no-reserve market)))))
            (let ((fee (/ (* usdc-out-gross TRADING-FEE-BP) u10000))
                  (usdc-out-net (- usdc-out-gross fee)))
                (asserts! (>= usdc-out-net min-usdc-out) ERR-SLIPPAGE-TOO-HIGH)
                (map-set markets market-id
                    (if (is-eq outcome u0)
                        (merge market {
                            no-reserve: (+ (get no-reserve market) amount),
                            yes-reserve: (- (get yes-reserve market) usdc-out-gross),
                            accumulated-fees: (+ (get accumulated-fees market) fee)
                        })
                        (merge market {
                            yes-reserve: (+ (get yes-reserve market) amount),
                            no-reserve: (- (get no-reserve market) usdc-out-gross),
                            accumulated-fees: (+ (get accumulated-fees market) fee)
                        })
                    )
                )
                (map-set outcome-balances { market-id: market-id, user: caller, outcome: outcome } (- balance amount))
                (try! (as-contract (contract-call? .mock-usdc transfer usdc-out-net tx-sender caller none)))
                (print { event: "outcome-sold", market: market-id, seller: caller, outcome: outcome, amount: amount, usdc-out: usdc-out-net })
                (ok usdc-out-net)
            )
        )
    )
)

(define-public (resolve (market-id uint) (outcome uint))
  (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get creator market)) ERR-NOT-AUTHORIZED)
    (asserts! (not (get is-resolved market)) ERR-MARKET-ALREADY-RESOLVED)
    (asserts! (>= block-height (get deadline market)) ERR-DEADLINE-NOT-PASSED)
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)

    (map-set markets market-id
      (merge market {
        is-resolved: true,
        winning-outcome: (some outcome),
        resolution-block: block-height
      })
    )
    (print { event: "market-resolved", market: market-id, outcome: outcome })
    (ok true)
  )
)

(define-public (claim (market-id uint))
  (let ((market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
        (caller tx-sender))
    (asserts! (get is-resolved market) ERR-MARKET-NOT-ACTIVE)
    (asserts! (is-some (get winning-outcome market)) ERR-MARKET-NOT-ACTIVE)
    (asserts! (>= block-height (+ (get resolution-block market) DISPUTE-WINDOW)) ERR-DISPUTE-WINDOW-ACTIVE)
    (asserts! (not (default-to false (map-get? has-claimed { market-id: market-id, user: caller }))) ERR-ALREADY-CLAIMED)

    (let ((winning-outcome (unwrap! (get winning-outcome market) ERR-MARKET-NOT-ACTIVE))
          (balance (default-to u0 (map-get? outcome-balances { market-id: market-id, user: caller, outcome: winning-outcome }))))
      (asserts! (> balance u0) ERR-NO-WINNINGS)

      (map-set has-claimed { market-id: market-id, user: caller } true)
      (map-set outcome-balances { market-id: market-id, user: caller, outcome: winning-outcome } u0)

      (try! (as-contract (contract-call? .mock-usdc transfer balance tx-sender caller none)))
      (print { event: "winnings-claimed", market: market-id, winner: caller, amount: balance })
      (ok balance)
    )
  )
)

;; AMM Math (no changes needed)

(define-read-only (calculate-tokens-out (amount-in uint) (reserve-in uint) (reserve-out uint))

  (if (or (is-eq amount-in u0) (is-eq reserve-in u0) (is-eq reserve-out u0))

    u0

    (/ (* reserve-out amount-in) (+ reserve-in amount-in))

  )

)



(define-read-only (calculate-amount-in (tokens-out uint) (reserve-in uint) (reserve-out uint))

  (if (or (is-eq tokens-out u0) (>= tokens-out reserve-out))

    u0

    (+ (/ (* reserve-in tokens-out) (- reserve-out tokens-out)) u1)

  )

)
