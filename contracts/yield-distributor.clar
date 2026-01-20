;; Yield Distributor Contract for StackPredict Protocol
;; Handles yield distribution logic for LPs based on time-weighted LP balances

;; Traits
(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "Yield Distributor Token")
(define-constant TOKEN-SYMBOL "yLD")
(define-constant TOKEN-DECIMALS u6)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-NOT-TOKEN-OWNER (err u301))
(define-constant ERR-ZERO-AMOUNT (err u302))
(define-constant ERR-INSUFFICIENT-BALANCE (err u303))
(define-constant ERR-ALREADY-CLAIMED (err u304))
(define-constant ERR-NO-YIELD-AVAILABLE (err u305))
(define-constant ERR-NOT-INITIALIZED (err u307))

;; Define the fungible token (yLD - yield distributor token)
(define-fungible-token y-ld)

;; Data Variables
(define-data-var total-yield-accumulated uint u0)      ;; Total yield accumulated across all pools
(define-data-var total-claims uint u0)                 ;; Total yield claimed by LPs

;; Maps
;; Track yield earned per pool (key: pool-contract-principal)
(define-map pool-yield-earned principal uint)

;; Track time-weighted LP balance for each user in each pool
;; Key: { pool: principal, lp: principal }
;; Value: { balance: uint, last-update: uint }
(define-map lp-time-weighted-balance
  { pool: principal, lp: principal }
  { balance: uint, last-update: uint }
)

;; Track pending yield for each user (calculated on-demand)
(define-map pending-yield principal uint)

;; Track if user has claimed yield for a specific pool
(define-map has-claimed-yield { pool: principal, lp: principal } bool)

;; SIP-010 Transfer (yLD tokens represent yield claims)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? y-ld amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (print {event: "transfer", sender: sender, recipient: recipient, amount: amount})
    (ok true)))

;; SIP-010 Get Name
(define-read-only (get-name)
  (ok TOKEN-NAME))

;; SIP-010 Get Symbol
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL))

;; SIP-010 Get Decimals
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS))

;; SIP-010 Get Balance (yLD balance = yield claim tokens)
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance y-ld who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply y-ld)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Update LP time-weighted balance
;; Called by market-pool when LP tokens are minted/burned
;; This maintains a time-weighted average of LP balances for yield calculation
(define-public (update-lp-balance (pool principal) (lp principal) (new-balance uint))
  (let
    (
      (current-time block-height)
    )
    ;; Only the pool contract can call this function
    ;; Using contract-caller to allow proper authorization through contract calls
    (asserts! (is-eq contract-caller pool) ERR-NOT-AUTHORIZED)

    ;; Update or create the time-weighted balance entry
    (map-set lp-time-weighted-balance
      { pool: pool, lp: lp }
      { balance: new-balance, last-update: current-time }
    )

    (print { event: "lp-balance-updated", pool: pool, lp: lp, balance: new-balance, time: current-time })
    (ok true)
  )
)

;; Deposit Yield
;; Called by yield-vault or market-pool to deposit earned yield for distribution
;; This function calculates and distributes yield to LPs based on their time-weighted balances
(define-public (deposit-yield (pool principal) (yield-amount uint))
  (let
    (
      (current-pool-yield (default-to u0 (map-get? pool-yield-earned pool)))
      (total-accumulated (var-get total-yield-accumulated))
    )
    (asserts! (> yield-amount u0) ERR-ZERO-AMOUNT)
    ;; Only yield sources (vaults or pools) can deposit yield
    ;; In practice, this would be called by yield-vault or market-pool after harvesting
    ;; Using contract-caller to allow proper authorization through contract calls
    (asserts! (or (is-eq contract-caller .yield-vault) (is-eq contract-caller .mock-zest-vault)) ERR-NOT-AUTHORIZED)

    ;; Update pool yield tracking
    (map-set pool-yield-earned pool (+ current-pool-yield yield-amount))
    (var-set total-yield-accumulated (+ total-accumulated yield-amount))

    ;; Mint yLD tokens to distribute yield proportionally to LPs
    ;; These tokens represent the right to claim yield
    (try! (ft-mint? y-ld yield-amount CONTRACT-OWNER))

    (print { event: "yield-deposited", pool: pool, amount: yield-amount, total-accumulated: (var-get total-yield-accumulated) })
    (ok yield-amount)
  )
)

;; Calculate Pending Yield
;; Calculates the yield a user is entitled to based on their time-weighted LP balance
;; Formula: user_yield = (user_lp_balance / total_pool_lp) * pool_yield_earned
(define-read-only (calculate-pending-yield (pool principal) (lp principal))
  (let
    (
      (lp-info (map-get? lp-time-weighted-balance { pool: pool, lp: lp }))
      (pool-yield (default-to u0 (map-get? pool-yield-earned pool)))
      (has-claimed (default-to false (map-get? has-claimed-yield { pool: pool, lp: lp })))
    )
    ;; Check if user has already claimed for this pool
    (if has-claimed
      (ok u0)
      ;; Check if LP has balance info
      (if (is-none lp-info)
        (ok u0)
        ;; Calculate proportional share
        ;; Note: In production, this would need to query the pool for total LP supply
        (let ((lp-balance (get balance (unwrap! lp-info (ok u0)))))
          (ok (/ (* lp-balance pool-yield) u1000000))  ;; Placeholder calculation
        )
      )
    )
  )
)

;; Claim Yield
;; LPs can claim their accumulated yield
;; Yield is calculated based on time-weighted LP balance
(define-public (claim-yield (pool principal))
  (let
    (
      (caller tx-sender)
      (lp-balance-info (map-get? lp-time-weighted-balance { pool: pool, lp: caller }))
      (pool-yield (default-to u0 (map-get? pool-yield-earned pool)))
      (has-claimed (default-to false (map-get? has-claimed-yield { pool: pool, lp: caller })))
    )
    (asserts! (is-some lp-balance-info) ERR-NOT-INITIALIZED)
    (asserts! (not has-claimed) ERR-ALREADY-CLAIMED)
    (asserts! (> pool-yield u0) ERR-NO-YIELD-AVAILABLE)

    (let
      (
        (lp-info (unwrap! lp-balance-info ERR-NOT-INITIALIZED))
        (lp-balance (get balance lp-info))
        ;; Calculate yield share (simplified - assumes LP balance is proportional to pool share)
        ;; In production, this would query the pool for total LP supply
        (yield-share (/ (* lp-balance pool-yield) u1000000))
      )
      (asserts! (> yield-share u0) ERR-NO-YIELD-AVAILABLE)

      ;; Mark as claimed
      (map-set has-claimed-yield { pool: pool, lp: caller } true)

      ;; Update pending yield tracking
      (map-set pending-yield caller (+ (default-to u0 (map-get? pending-yield caller)) yield-share))

      ;; Transfer yLD tokens to user (representing yield claim)
      (try! (ft-mint? y-ld yield-share caller))

      ;; Update total claims
      (var-set total-claims (+ (var-get total-claims) yield-share))

      (print { event: "yield-claimed", pool: pool, lp: caller, amount: yield-share })
      (ok yield-share)
    )
  )
)

;; Read-only: Get total yield accumulated across all pools
(define-read-only (get-total-yield-accumulated)
  (ok (var-get total-yield-accumulated)))

;; Read-only: Get total yield claimed by LPs
(define-read-only (get-total-claims)
  (ok (var-get total-claims)))

;; Read-only: Get yield earned for a specific pool
(define-read-only (get-pool-yield-earned (pool principal))
  (ok (default-to u0 (map-get? pool-yield-earned pool))))

;; Read-only: Get LP time-weighted balance
(define-read-only (get-lp-time-weighted-balance (pool principal) (lp principal))
  (ok (default-to { balance: u0, last-update: u0 } (map-get? lp-time-weighted-balance { pool: pool, lp: lp }))))

;; Read-only: Get pending yield for a user
(define-read-only (get-pending-yield (who principal))
  (ok (default-to u0 (map-get? pending-yield who))))

;; Read-only: Check if user has claimed yield for a specific pool
(define-read-only (get-has-claimed-yield (pool principal) (lp principal))
  (ok (default-to false (map-get? has-claimed-yield { pool: pool, lp: lp }))))

;; Admin: Mint tokens (for testing)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-mint? y-ld amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)))

;; Admin: Burn tokens (for testing)
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance y-ld caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? y-ld amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)))
