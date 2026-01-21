;; Market Fork Contract for StackPredict Protocol
;; Implements Layer 5: Fork (Nuclear Option)
;; Triggered when >10% of supply disputes the outcome after Layer 4 voting
;;
;; Flow:
;; 1. Check fork threshold: disputed_stake / total_staked > FORK_THRESHOLD
;; 2. Initiate fork, creating two child markets:
;;    - market-id-A: Original resolution stands
;;    - market-id-B: Disputed resolution wins
;; 3. Users migrate positions to their chosen fork
;; 4. After FORK_SETTLEMENT_PERIOD (30 days):
;;    - Fork with more liquidity/volume = canonical
;;    - Other fork positions can redeem at discount or hold

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)

;; Fork parameters
(define-constant FORK-THRESHOLD u1000)           ;; 10% (in basis points: 1000 = 10%)
(define-constant FORK-SETTLEMENT-PERIOD u43200)    ;; 30 days in blocks (144 blocks/day * 30)
(define-constant FORK-DISCOUNT u500000)            ;; 50% discount for non-canonical fork redemption

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1500))
(define-constant ERR-ZERO-AMOUNT (err u1501))
(define-constant ERR-MARKET-NOT-FOUND (err u1502))
(define-constant ERR-ALREADY-FORKED (err u1503))
(define-constant ERR-FORK-NOT-INITIATED (err u1504))
(define-constant ERR-FORK-NOT-SETTLED (err u1505))
(define-constant ERR-INVALID-FORK-CHOICE (err u1506))
(define-constant ERR-NO-POSITION-FOUND (err u1507))
(define-constant ERR-ALREADY-MIGRATED (err u1508))
(define-constant ERR-FORK-NOT-CANONICAL (err u1509))
(define-constant ERR-THRESHOLD-NOT-REACHED (err u1510))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Fork state structure
;; - original-market-id: ID of the original market
;; - fork-a-market-id: Child market where original resolution stands
;; - fork-b-market-id: Child market where disputed resolution wins
;; - initiated-by: Principal who initiated the fork
;; - initiated-at: Block height when fork was initiated
;; - settled-at: Block height when fork settlement ends
;; - canonical-fork: Which fork is canonical (0 = A, 1 = B, none = not settled)
;; - total-staked-a: Total tokens staked in fork A
;; - total-staked-b: Total tokens staked in fork B
;; - dispute-stake: Amount of disputed stake that triggered fork
;; - total-supply: Total supply at time of fork
(define-map fork-states
  uint
  {
    original-market-id: uint,
    fork-a-market-id: uint,
    fork-b-market-id: uint,
    initiated-by: principal,
    initiated-at: uint,
    settled-at: (optional uint),
    canonical-fork: (optional uint),
    total-staked-a: uint,
    total-staked-b: uint,
    dispute-stake: uint,
    total-supply: uint
  }
)

;; Track original market to fork mapping
(define-map market-forks
  uint
  uint ;; fork-id
)

;; Position structure for user holdings in original market
;; - user: Principal holding the position
;; - original-market-id: ID of the original market
;; - yes-balance: YES token balance in original market
;; - no-balance: NO token balance in original market
;; - migrated-to: Which fork they migrated to (0 = A, 1 = B, none = not migrated)
;; - migrated-at: Block height when migrated
(define-map user-positions
  { market-id: uint, user: principal }
  {
    yes-balance: uint,
    no-balance: uint,
    migrated-to: (optional uint),
    migrated-at: (optional uint)
  }
)

;; Track which users have positions in each fork
(define-map fork-users
  { fork-id: uint, fork-choice: uint }
  (list 100 principal)
)

;; Sequential fork ID counter
(define-data-var fork-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Check if fork threshold is reached
;; disputed_stake / total_supply > FORK_THRESHOLD
(define-private (check-fork-threshold (market-id uint) (dispute-stake uint) (total-supply uint))
  (let
    (
      ;; Calculate disputed percentage (basis points)
      ;; disputed_percentage = (dispute-stake * 10000) / total-supply
      (disputed-percentage
        (if (> total-supply u0)
          (/ (* dispute-stake u10000) total-supply)
          u0
        )
      )
    )
    (>= disputed-percentage FORK-THRESHOLD)
  )
)

;; Get fork state by ID
(define-read-only (get-fork-state (fork-id uint))
  (ok (map-get? fork-states fork-id))
)

;; Get fork ID for a market
(define-read-only (get-market-fork (market-id uint))
  (ok (map-get? market-forks market-id))
)

;; Get user position in original market
(define-read-only (get-user-position (market-id uint) (user principal))
  (ok (map-get? user-positions { market-id: market-id, user: user }))
)

;; Get users who migrated to a specific fork choice
(define-read-only (get-fork-users (fork-id uint) (fork-choice uint))
  (ok (default-to (list) (map-get? fork-users { fork-id: fork-id, fork-choice: fork-choice })))
)

;; Check if fork has been settled
(define-read-only (is-fork-settled (fork-id uint))
  (match (map-get? fork-states fork-id)
    state
    (ok (is-some (get settled-at state)))
    (ok false)
  )
)

;; Check if fork is canonical
(define-read-only (is-fork-canonical (fork-id uint) (fork-choice uint))
  (match (map-get? fork-states fork-id)
    state
    (match (get canonical-fork state)
      canonical
      (ok (is-eq canonical fork-choice))
      (ok false)
    )
    (ok false)
  )
)

;; Calculate claimable amount for non-canonical fork
;; Returns: amount * FORK-DISCOUNT
(define-private (calculate-non-canonical-claim (amount uint))
  (/ (* amount FORK-DISCOUNT) PRECISION)
)

;; Get current fork ID counter
(define-read-only (get-fork-id-counter)
  (ok (var-get fork-id-counter))
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Initiate fork for a market
;; Called when fork threshold is reached
;; Creates two child markets: A (original resolution) and B (disputed resolution)
(define-public (initiate-fork
    (original-market-id uint)
    (dispute-stake uint)
    (total-supply uint)
    (original-resolution uint)
    (disputed-resolution uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (new-fork-id (+ (var-get fork-id-counter) u1))
      (threshold-reached (check-fork-threshold original-market-id dispute-stake total-supply))
    )
    ;; Validate parameters
    (asserts! threshold-reached ERR-THRESHOLD-NOT-REACHED)
    (asserts! (or (is-eq original-resolution u0) (is-eq original-resolution u1)) ERR-INVALID-FORK-CHOICE)
    (asserts! (or (is-eq disputed-resolution u0) (is-eq disputed-resolution u1)) ERR-INVALID-FORK-CHOICE)
    (asserts! (not (is-eq original-resolution disputed-resolution)) ERR-INVALID-FORK-CHOICE)

    ;; Check if market already has a fork
    (asserts! (is-none (map-get? market-forks original-market-id)) ERR-ALREADY-FORKED)

    ;; Note: In production, actual market creation would happen here
    ;; For now, we use the original market ID + offset to simulate child market IDs
    ;; In a real implementation, this would call market-factory to create new markets
    (let
      (
        (fork-a-market-id original-market-id)  ;; Fork A keeps original market ID
        (fork-b-market-id (+ original-market-id u1000000))  ;; Fork B gets new ID
      )
      ;; Initialize fork state
      (map-set fork-states
        new-fork-id
        {
          original-market-id: original-market-id,
          fork-a-market-id: fork-a-market-id,
          fork-b-market-id: fork-b-market-id,
          initiated-by: caller,
          initiated-at: block-height,
          settled-at: none,
          canonical-fork: none,
          total-staked-a: u0,
          total-staked-b: u0,
          dispute-stake: dispute-stake,
          total-supply: total-supply
        }
      )

      ;; Link original market to fork
      (map-set market-forks original-market-id new-fork-id)

      ;; Update fork ID counter
      (var-set fork-id-counter new-fork-id)

      (print
        {
          event: "fork-initiated",
          fork-id: new-fork-id,
          original-market-id: original-market-id,
          fork-a-market-id: fork-a-market-id,
          fork-b-market-id: fork-b-market-id,
          initiated-by: caller,
          initiated-at: block-height,
          settlement-end: (+ block-height FORK-SETTLEMENT-PERIOD),
          dispute-stake: dispute-stake,
          total-supply: total-supply,
          original-resolution: original-resolution,
          disputed-resolution: disputed-resolution
        }
      )

      (ok new-fork-id)
    )
  )
)

;; Migrate position to chosen fork
;; Users can migrate their positions from original market to either fork A or B
(define-public (migrate-position
    (original-market-id uint)
    (fork-choice uint)
    (yes-balance uint)
    (no-balance uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (fork-id (unwrap! (map-get? market-forks original-market-id) ERR-FORK-NOT-INITIATED))
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-FORK-NOT-INITIATED))
      (position-key { market-id: original-market-id, user: caller })
      (existing-position (map-get? user-positions position-key))
    )
    (begin
      ;; Validate parameters
      (asserts! (or (is-eq fork-choice u0) (is-eq fork-choice u1)) ERR-INVALID-FORK-CHOICE)
      (asserts! (is-none (get settled-at fork-state)) ERR-FORK-NOT-SETTLED)

      ;; Check if user already migrated
      (match existing-position
        pos
        (asserts! (is-none (get migrated-to pos)) ERR-ALREADY-MIGRATED)
        true
      )

      ;; Record user position
      (map-set user-positions
        position-key
        {
          yes-balance: yes-balance,
          no-balance: no-balance,
          migrated-to: (some fork-choice),
          migrated-at: (some block-height)
        }
      )

      ;; Update fork totals
      (let
        (
          (new-total-a
            (if (is-eq fork-choice u0)
              (+ (get total-staked-a fork-state) yes-balance no-balance)
              (get total-staked-a fork-state)
            )
          )
          (new-total-b
            (if (is-eq fork-choice u1)
              (+ (get total-staked-b fork-state) yes-balance no-balance)
              (get total-staked-b fork-state)
            )
          )
        )
        (map-set fork-states
          fork-id
          (merge fork-state
            {
              total-staked-a: new-total-a,
              total-staked-b: new-total-b
            }
          )
        )
      )

      ;; Add user to fork users list
      (let
        (
          (current-users (default-to (list) (map-get? fork-users { fork-id: fork-id, fork-choice: fork-choice })))
          (new-users (unwrap-panic (as-max-len? (append current-users caller) u100)))
        )
        (map-set fork-users { fork-id: fork-id, fork-choice: fork-choice } new-users)
      )

      (print
        {
          event: "position-migrated",
          fork-id: fork-id,
          user: caller,
          fork-choice: fork-choice,
          yes-balance: yes-balance,
          no-balance: no-balance,
          block-height: block-height
        }
      )

      (ok true)
    )
  )
)

;; Settle fork
;; After settlement period, determine canonical fork based on total staked
(define-public (settle-fork (fork-id uint))
  (let
    (
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-MARKET-NOT-FOUND))
      (settlement-end (+ (get initiated-at fork-state) FORK-SETTLEMENT-PERIOD))
    )
    ;; Check if settlement period has ended
    (asserts! (>= block-height settlement-end) ERR-FORK-NOT-SETTLED)

    ;; Check if already settled
    (asserts! (is-none (get settled-at fork-state)) ERR-FORK-NOT-SETTLED)

    ;; Determine canonical fork based on total staked
    (let
      (
        (total-a (get total-staked-a fork-state))
        (total-b (get total-staked-b fork-state))
        (canonical-fork
          (if (> total-a total-b)
            u0  ;; Fork A wins
            u1  ;; Fork B wins (ties go to disputed resolution)
          )
        )
      )
      (map-set fork-states
        fork-id
        (merge fork-state
          {
            settled-at: (some block-height),
            canonical-fork: (some canonical-fork)
          }
        )
      )

      (print
        {
          event: "fork-settled",
          fork-id: fork-id,
          settled-at: block-height,
          canonical-fork: canonical-fork,
          total-staked-a: total-a,
          total-staked-b: total-b,
          settlement-period: FORK-SETTLEMENT-PERIOD
        }
      )

      (ok canonical-fork)
    )
  )
)

;; Claim from canonical fork
;; Users can claim their position from the canonical fork
(define-public (claim-canonical
    (original-market-id uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (fork-id (unwrap! (map-get? market-forks original-market-id) ERR-FORK-NOT-INITIATED))
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-FORK-NOT-SETTLED))
      (canonical-fork (unwrap! (get canonical-fork fork-state) ERR-FORK-NOT-SETTLED))
      (position (unwrap! (map-get? user-positions { market-id: original-market-id, user: caller }) ERR-NO-POSITION-FOUND))
      (migrated-to (unwrap! (get migrated-to position) ERR-NO-POSITION-FOUND))
    )
    ;; Check if user migrated to canonical fork
    (asserts! (is-eq migrated-to canonical-fork) ERR-FORK-NOT-CANONICAL)

    ;; Calculate total position value
    (let
      (
        (total-value (+ (get yes-balance position) (get no-balance position)))
      )
      ;; Note: In production, this would transfer tokens from the canonical fork market
      ;; For now, we just emit an event
      (print
        {
          event: "claim-canonical",
          fork-id: fork-id,
          user: caller,
          canonical-fork: canonical-fork,
          yes-balance: (get yes-balance position),
          no-balance: (get no-balance position),
          total-value: total-value
        }
      )

      (ok total-value)
    )
  )
)

;; Claim from non-canonical fork
;; Users can claim from non-canonical fork at a discount
(define-public (claim-non-canonical
    (original-market-id uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (fork-id (unwrap! (map-get? market-forks original-market-id) ERR-FORK-NOT-INITIATED))
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-FORK-NOT-SETTLED))
      (canonical-fork (unwrap! (get canonical-fork fork-state) ERR-FORK-NOT-SETTLED))
      (position (unwrap! (map-get? user-positions { market-id: original-market-id, user: caller }) ERR-NO-POSITION-FOUND))
      (migrated-to (unwrap! (get migrated-to position) ERR-NO-POSITION-FOUND))
    )
    (begin
      ;; Check if user migrated to non-canonical fork
      (asserts! (not (is-eq migrated-to canonical-fork)) ERR-FORK-NOT-CANONICAL)

      ;; Calculate discounted claim amount
      (let
        (
          (total-value (+ (get yes-balance position) (get no-balance position)))
          (discounted-amount (calculate-non-canonical-claim total-value))
        )
        ;; Note: In production, this would transfer discounted tokens
        ;; For now, we just emit an event
        (print
          {
            event: "claim-non-canonical",
            fork-id: fork-id,
            user: caller,
            canonical-fork: canonical-fork,
            migrated-to: migrated-to,
            original-value: total-value,
            discounted-amount: discounted-amount,
            discount-percentage: FORK-DISCOUNT
          }
        )

        (ok discounted-amount)
      )
    )
  )
)

;; Reset fork state (owner only, for testing/correction)
(define-public (reset-fork (fork-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-delete fork-states fork-id)

    (print
      {
        event: "fork-reset",
        fork-id: fork-id
      }
    )

    (ok true)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Update fork parameters (owner only)
(define-public (update-fork-params
    (new-threshold uint)
    (new-settlement-period uint)
    (new-discount uint)
  )
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-threshold u0) ERR-ZERO-AMOUNT)
    (asserts! (> new-settlement-period u0) ERR-ZERO-AMOUNT)
    (asserts! (<= new-discount PRECISION) ERR-ZERO-AMOUNT)

    ;; Note: In production, these would be stored in data-vars
    ;; For now, they're constants so we just emit an event
    (print
      {
        event: "fork-params-updated",
        new-threshold: new-threshold,
        new-settlement-period: new-settlement-period,
        new-discount: new-discount
      }
    )

    (ok true)
  )
)
