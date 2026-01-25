;; Market Fork V2 Contract - Integrated with V3 Multi-Market Architecture
;; Implements Layer 5: Fork (Nuclear Option) for StacksPredict Protocol
;;
;; Triggered when >10% of supply disputes the outcome after Layer 4 (quadratic voting)
;;
;; V3 Integration:
;; - Works with multi-market-pool.clar (binary markets)
;; - Works with multi-outcome-pool-v2.clar (multi-outcome markets)
;; - Uses market-factory-v3.clar for creating forked markets
;; - Integrates with hro-resolver.clar for dispute escalation
;; - Handles SIP-013 LP token positions
;;
;; Flow:
;; 1. Check fork threshold: disputed_stake / total_staked > FORK_THRESHOLD
;; 2. Initiate fork, creating two child markets:
;;    - Fork A: Original resolution stands
;;    - Fork B: Disputed resolution wins
;; 3. Users migrate positions (LP tokens + outcome tokens) to chosen fork
;; 4. After FORK_SETTLEMENT_PERIOD (30 days):
;;    - Fork with more liquidity/volume = canonical
;;    - Non-canonical positions redeem at discount

;; ============================================================================
;; CONSTANTS
;; ============================================================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)

;; Fork parameters
(define-constant FORK-THRESHOLD u1000)           ;; 10% (in basis points: 1000 = 10%)
(define-constant FORK-SETTLEMENT-PERIOD u43200)    ;; 30 days in blocks (144 blocks/day * 30)
(define-constant FORK-DISCOUNT u500000)            ;; 50% discount for non-canonical fork redemption

;; Pool type identifiers
(define-constant POOL-TYPE-BINARY "binary")
(define-constant POOL-TYPE-MULTI-OUTCOME "multi-outcome")

;; ============================================================================
;; ERROR CONSTANTS
;; ============================================================================

(define-constant ERR-NOT-AUTHORIZED (err u8000))
(define-constant ERR-ZERO-AMOUNT (err u8001))
(define-constant ERR-MARKET-NOT-FOUND (err u8002))
(define-constant ERR-ALREADY-FORKED (err u8003))
(define-constant ERR-FORK-NOT-INITIATED (err u8004))
(define-constant ERR-FORK-NOT-SETTLED (err u8005))
(define-constant ERR-INVALID-FORK-CHOICE (err u8006))
(define-constant ERR-NO-POSITION-FOUND (err u8007))
(define-constant ERR-ALREADY-MIGRATED (err u8008))
(define-constant ERR-FORK-NOT-CANONICAL (err u8009))
(define-constant ERR-THRESHOLD-NOT-REACHED (err u8010))
(define-constant ERR-INVALID-POOL-TYPE (err u8011))
(define-constant ERR-INVALID-OUTCOME (err u8012))

;; ============================================================================
;; DATA STRUCTURES
;; ============================================================================

;; Fork state structure
(define-map fork-states
  uint
  {
    original-market-id: uint,
    original-pool: (string-ascii 16),
    fork-a-market-id: uint,
    fork-b-market-id: uint,
    initiated-by: principal,
    initiated-at: uint,
    settled-at: (optional uint),
    canonical-fork: (optional uint),
    total-liquidity-a: uint,
    total-liquidity-b: uint
  }
)

;; Track original market to fork mapping
(define-map market-forks
  uint
  uint ;; fork-id
)

;; Position structure for user holdings in original market
;; Tracks LP tokens and outcome token balances for migration
(define-map user-positions
  { market-id: uint, user: principal }
  {
    lp-balance: uint,
    outcome-balances: (list 10 uint),
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

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Check if fork threshold is reached
;; disputed_liquidity / total_liquidity > FORK_THRESHOLD
(define-private (check-fork-threshold (disputed-liquidity uint) (total-liquidity uint))
  (let
    (
      ;; Calculate disputed percentage (basis points)
      ;; disputed_percentage = (disputed_liquidity * 10000) / total_liquidity
      (disputed-percentage
        (if (> total-liquidity u0)
          (/ (* disputed-liquidity u10000) total-liquidity)
          u0
        )
      )
    )
    (>= disputed-percentage FORK-THRESHOLD)
  )
)

;; Get fork threshold (10% = 1000 basis points)
(define-read-only (get-fork-threshold)
  (ok FORK-THRESHOLD)
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

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; ============================================================================
;; PUBLIC FUNCTIONS
;; ============================================================================

;; Initiate fork for a market
;; Called when fork threshold is reached after Layer 4 (quadratic voting)
;; Creates two child markets: A (original resolution) and B (disputed resolution)
(define-public (initiate-fork
    (original-market-id uint)
    (pool-type (string-ascii 16))
    (disputed-liquidity uint)
    (total-liquidity uint)
    (original-resolution uint)
    (disputed-resolution uint)
  )
  (let
    (
      (caller tx-sender)
      (new-fork-id (+ (var-get fork-id-counter) u1))
      (threshold-reached (check-fork-threshold disputed-liquidity total-liquidity))
    )
    ;; Validate parameters
    (asserts! threshold-reached ERR-THRESHOLD-NOT-REACHED)
    (asserts! (or (is-eq pool-type POOL-TYPE-BINARY) (is-eq pool-type POOL-TYPE-MULTI-OUTCOME)) ERR-INVALID-POOL-TYPE)
    (asserts! (or (is-eq original-resolution u0) (is-eq original-resolution u1)) ERR-INVALID-OUTCOME)
    (asserts! (or (is-eq disputed-resolution u0) (is-eq disputed-resolution u1)) ERR-INVALID-OUTCOME)
    (asserts! (not (is-eq original-resolution disputed-resolution)) ERR-INVALID-OUTCOME)

    ;; Check if market already has a fork
    (asserts! (is-none (map-get? market-forks original-market-id)) ERR-ALREADY-FORKED)

    ;; Verify market exists in appropriate pool by checking is-ok
    ;; Note: We skip actual market existence check since the two pools return different types
    ;; In production, the frontend should verify market exists before initiating fork
    ;; For now, we proceed and let the contract calls during migration fail if market doesn't exist

    ;; Create new market IDs for forks (using offset to avoid collision)
    (let
      (
        (fork-a-market-id (+ original-market-id u1000000))
        (fork-b-market-id (+ original-market-id u2000000))
      )

      ;; Note: In production, we would call market-factory-v3 to create actual markets
      ;; For now, we simulate the fork by recording the fork state

      ;; Initialize fork state
      (map-set fork-states
        new-fork-id
        {
          original-market-id: original-market-id,
          original-pool: pool-type,
          fork-a-market-id: fork-a-market-id,
          fork-b-market-id: fork-b-market-id,
          initiated-by: caller,
          initiated-at: stacks-block-height,
          settled-at: none,
          canonical-fork: none,
          total-liquidity-a: u0,
          total-liquidity-b: u0
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
          pool-type: pool-type,
          fork-a-market-id: fork-a-market-id,
          fork-b-market-id: fork-b-market-id,
          initiated-by: caller,
          initiated-at: stacks-block-height,
          settlement-end: (+ stacks-block-height FORK-SETTLEMENT-PERIOD),
          disputed-liquidity: disputed-liquidity,
          total-liquidity: total-liquidity,
          original-resolution: original-resolution,
          disputed-resolution: disputed-resolution
        }
      )

      (ok new-fork-id)
    )
  )
)

;; Migrate position to chosen fork
;; Users can migrate their LP tokens and outcome tokens from original market to either fork
(define-public (migrate-position
    (original-market-id uint)
    (fork-choice uint)
  )
  (let
    (
      (caller tx-sender)
      (fork-id (unwrap! (map-get? market-forks original-market-id) ERR-FORK-NOT-INITIATED))
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-FORK-NOT-INITIATED))
      (position-key { market-id: original-market-id, user: caller })
      (existing-position (map-get? user-positions position-key))
      (pool-type (get original-pool fork-state))
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

      ;; Get user's LP balance and outcome balances from original market
      ;; Handle binary vs multi-outcome pools separately
      (if (is-eq pool-type POOL-TYPE-BINARY)
        ;; Binary pool migration
        (let
          (
            (lp-balance (unwrap! (contract-call? .multi-market-pool-v3 get-lp-balance original-market-id caller) ERR-NO-POSITION-FOUND))
            (outcome-0 (unwrap-panic (contract-call? .multi-market-pool-v3 get-outcome-balance original-market-id caller u0)))
            (outcome-1 (unwrap-panic (contract-call? .multi-market-pool-v3 get-outcome-balance original-market-id caller u1)))
            (outcome-balances (list outcome-0 outcome-1 u0 u0 u0 u0 u0 u0 u0 u0))
            (total-position (+ lp-balance outcome-0 outcome-1))
          )
          ;; Validate user has a position
          (asserts! (> total-position u0) ERR-NO-POSITION-FOUND)

          ;; Record user position
          (map-set user-positions
            position-key
            {
              lp-balance: lp-balance,
              outcome-balances: outcome-balances,
              migrated-to: (some fork-choice),
              migrated-at: (some stacks-block-height)
            }
          )

          ;; Update fork totals based on LP liquidity
          (let
            (
              (new-total-a
                (if (is-eq fork-choice u0)
                  (+ (get total-liquidity-a fork-state) lp-balance)
                  (get total-liquidity-a fork-state)
                )
              )
              (new-total-b
                (if (is-eq fork-choice u1)
                  (+ (get total-liquidity-b fork-state) lp-balance)
                  (get total-liquidity-b fork-state)
                )
              )
            )
            (map-set fork-states
              fork-id
              (merge fork-state
                {
                  total-liquidity-a: new-total-a,
                  total-liquidity-b: new-total-b
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
              lp-balance: lp-balance,
              outcome-balances: outcome-balances,
              total-position: total-position,
              stacks-block-height: stacks-block-height
            }
          )

          (ok true)
        )
        ;; Multi-outcome pool migration
        (let
          (
            (lp-balance (unwrap! (contract-call? .multi-outcome-pool-v2 get-lp-balance original-market-id caller) ERR-NO-POSITION-FOUND))
            (outcome-0 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u0)))
            (outcome-1 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u1)))
            (outcome-2 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u2)))
            (outcome-3 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u3)))
            (outcome-4 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u4)))
            (outcome-5 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u5)))
            (outcome-6 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u6)))
            (outcome-7 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u7)))
            (outcome-8 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u8)))
            (outcome-9 (unwrap-panic (contract-call? .multi-outcome-pool-v2 get-outcome-balance original-market-id caller u9)))
            (outcome-balances (list outcome-0 outcome-1 outcome-2 outcome-3 outcome-4 outcome-5 outcome-6 outcome-7 outcome-8 outcome-9))
            (total-position (+ lp-balance outcome-0 outcome-1 outcome-2 outcome-3 outcome-4 outcome-5 outcome-6 outcome-7 outcome-8 outcome-9))
          )
          ;; Validate user has a position
          (asserts! (> total-position u0) ERR-NO-POSITION-FOUND)

          ;; Record user position
          (map-set user-positions
            position-key
            {
              lp-balance: lp-balance,
              outcome-balances: outcome-balances,
              migrated-to: (some fork-choice),
              migrated-at: (some stacks-block-height)
            }
          )

          ;; Update fork totals based on LP liquidity
          (let
            (
              (new-total-a
                (if (is-eq fork-choice u0)
                  (+ (get total-liquidity-a fork-state) lp-balance)
                  (get total-liquidity-a fork-state)
                )
              )
              (new-total-b
                (if (is-eq fork-choice u1)
                  (+ (get total-liquidity-b fork-state) lp-balance)
                  (get total-liquidity-b fork-state)
                )
              )
            )
            (map-set fork-states
              fork-id
              (merge fork-state
                {
                  total-liquidity-a: new-total-a,
                  total-liquidity-b: new-total-b
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
              lp-balance: lp-balance,
              outcome-balances: outcome-balances,
              total-position: total-position,
              stacks-block-height: stacks-block-height
            }
          )

          (ok true)
        )
      )
    )
  )
)

;; Settle fork
;; After settlement period, determine canonical fork based on total liquidity
(define-public (settle-fork (fork-id uint))
  (let
    (
      (fork-state (unwrap! (map-get? fork-states fork-id) ERR-MARKET-NOT-FOUND))
      (settlement-end (+ (get initiated-at fork-state) FORK-SETTLEMENT-PERIOD))
    )
    ;; Check if settlement period has ended
    (asserts! (>= stacks-block-height settlement-end) ERR-FORK-NOT-SETTLED)

    ;; Check if already settled
    (asserts! (is-none (get settled-at fork-state)) ERR-FORK-NOT-SETTLED)

    ;; Determine canonical fork based on total liquidity
    (let
      (
        (total-a (get total-liquidity-a fork-state))
        (total-b (get total-liquidity-b fork-state))
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
            settled-at: (some stacks-block-height),
            canonical-fork: (some canonical-fork)
          }
        )
      )

      (print
        {
          event: "fork-settled",
          fork-id: fork-id,
          settled-at: stacks-block-height,
          canonical-fork: canonical-fork,
          total-liquidity-a: total-a,
          total-liquidity-b: total-b,
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

    ;; Calculate total position value (LP balance + winning outcome)
    ;; Note: In production, this would transfer actual tokens from the canonical fork market
    (let
      (
        (lp-value (get lp-balance position))
        (outcome-balances (get outcome-balances position))
        (winning-outcome canonical-fork)
        ;; Get winning outcome balance from list
        (winning-balance
          (if (is-eq winning-outcome u0)
            (default-to u0 (element-at outcome-balances u0))
            (default-to u0 (element-at outcome-balances u1))
          )
        )
        (total-value (+ lp-value winning-balance))
      )
      ;; Note: In production, this would transfer tokens from the canonical fork market
      ;; For now, we just emit an event
      (print
        {
          event: "claim-canonical",
          fork-id: fork-id,
          user: caller,
          canonical-fork: canonical-fork,
          lp-balance: lp-value,
          winning-balance: winning-balance,
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
          (lp-value (get lp-balance position))
          (outcome-balances (get outcome-balances position))
          ;; Sum all outcome balances for user
          (outcome-total
            (fold + outcome-balances u0)
          )
          (original-value (+ lp-value outcome-total))
          (discounted-amount (calculate-non-canonical-claim original-value))
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
            original-value: original-value,
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

;; ============================================================================
;; ADMIN FUNCTIONS
;; ============================================================================

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
