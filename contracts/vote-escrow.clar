;; Vote-Escrow Contract for StackPredict Protocol
;; Lock $PRED governance tokens to earn voting power
;; Vote-escrow style like veCRV - longer locks = more voting power

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-LOCK-DURATION u210240) ;; 4 years in blocks (144 blocks/day * 365 * 4)
(define-constant MIN-LOCK-DURATION u1008)   ;; 1 week in blocks (144 blocks/day * 7)
(define-constant PRECISION u1000000)        ;; For precise calculations

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u800))
(define-constant ERR-ZERO-AMOUNT (err u801))
(define-constant ERR-INSUFFICIENT-BALANCE (err u802))
(define-constant ERR-LOCK-NOT-EXPIRED (err u803))
(define-constant ERR-NO-LOCK-FOUND (err u804))
(define-constant ERR-INVALID-DURATION (err u805))
(define-constant ERR-ALREADY-LOCKED (err u806))
(define-constant ERR-LOCK-EXPIRED (err u807))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Lock structure for each user
;; - amount: Number of PRED tokens locked
;; - unlock-height: Block height when lock expires
;; - locked-at: Block height when lock was created/extended
(define-map locks
  principal
  {
    amount: uint,
    unlock-height: uint,
    locked-at: uint
  }
)

;; Track total locked supply
(define-data-var total-locked uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get lock details for a user
(define-read-only (get-lock (user principal))
  (ok (map-get? locks user))
)

;; Calculate voting power for a user
;; Formula: voting-power = locked-amount * (lock-duration / MAX-LOCK-DURATION)
;; Uses PRECISION for accurate calculations
(define-read-only (get-voting-power (user principal))
  (match (map-get? locks user)
    lock
    (let
      (
        (locked-amount (get amount lock))
        (unlock-height (get unlock-height lock))
        (current-height block-height)
      )
      ;; Check if lock is still active
      (if (>= current-height unlock-height)
        (ok u0) ;; Lock expired, no voting power
        (let
          (
            (lock-duration (- unlock-height current-height))
            (power-scaled (/ (* locked-amount lock-duration PRECISION) MAX-LOCK-DURATION))
          )
          (ok (/ power-scaled PRECISION))
        )
      )
    )
    (ok u0) ;; No lock found
  )
)

;; Get total voting power across all users
(define-read-only (get-total-voting-power)
  (ok (var-get total-locked))
)

;; Check if a user has an active lock
(define-read-only (has-active-lock (user principal))
  (match (map-get? locks user)
    lock
    (let
      (
        (unlock-height (get unlock-height lock))
        (current-height block-height)
      )
      (ok (< current-height unlock-height))
    )
    (ok false)
  )
)

;; Get the maximum possible voting power for a given amount
;; This is the power if locked for MAX-LOCK-DURATION
(define-read-only (get-max-voting-power (amount uint))
  (ok amount)
)

;; Calculate voting power for a specific lock amount and duration
(define-read-only (calculate-voting-power (amount uint) (duration uint))
  (begin
    (asserts! (>= duration MIN-LOCK-DURATION) ERR-INVALID-DURATION)
    (asserts! (<= duration MAX-LOCK-DURATION) ERR-INVALID-DURATION)
    (let
      (
        (power-scaled (/ (* amount duration PRECISION) MAX-LOCK-DURATION))
      )
      (ok (/ power-scaled PRECISION))
    )
  )
)

;; Get current block height (for testing/verification)
(define-read-only (get-current-block-height)
  (ok block-height)
)

;; Get max lock duration constant
(define-read-only (get-max-lock-duration)
  (ok MAX-LOCK-DURATION)
)

;; Get min lock duration constant
(define-read-only (get-min-lock-duration)
  (ok MIN-LOCK-DURATION)
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Lock tokens to earn voting power
;; User must approve this contract to spend their PRED tokens first
(define-public (lock-tokens (amount uint) (duration uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (current-lock (map-get? locks caller))
      (unlock-height (+ block-height duration))
    )
    ;; Validate parameters
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= duration MIN-LOCK-DURATION) ERR-INVALID-DURATION)
    (asserts! (<= duration MAX-LOCK-DURATION) ERR-INVALID-DURATION)

    ;; Check if user already has an active lock
    (match current-lock
      existing-lock
      (begin
        ;; User has existing lock - check if expired
        (asserts! (>= block-height (get unlock-height existing-lock)) ERR-ALREADY-LOCKED)
        ;; Lock is expired, allow new lock
      )
      ;; No existing lock, continue
      true
    )

    ;; Transfer tokens from user to this contract
    (try! (contract-call? token transfer amount caller (as-contract tx-sender) none))

    ;; Create/update lock
    (map-set locks
      caller
      {
        amount: amount,
        unlock-height: unlock-height,
        locked-at: block-height
      }
    )

    ;; Update total locked
    (var-set total-locked (+ (var-get total-locked) amount))

    (print
      {
        event: "tokens-locked",
        user: caller,
        amount: amount,
        duration: duration,
        unlock-height: unlock-height,
        voting-power: (try! (calculate-voting-power amount duration))
      }
    )

    (ok true)
  )
)

;; Extend lock duration for existing lock
;; Increases voting power by extending the lock time
(define-public (extend-lock (duration uint))
  (let
    (
      (caller tx-sender)
      (lock (unwrap! (map-get? locks caller) ERR-NO-LOCK-FOUND))
      (current-unlock (get unlock-height lock))
      (new-unlock (+ current-unlock duration))
    )
    ;; Validate parameters
    (asserts! (>= duration MIN-LOCK-DURATION) ERR-INVALID-DURATION)
    (asserts! (<= (- new-unlock block-height) MAX-LOCK-DURATION) ERR-INVALID-DURATION)

    ;; Check if lock is still active or recently expired
    ;; Allow extending if expired within the last week (grace period)
    (asserts! (>= block-height (- current-unlock MIN-LOCK-DURATION)) ERR-LOCK-EXPIRED)

    ;; Update lock
    (map-set locks
      caller
      (merge lock
        {
          unlock-height: new-unlock,
          locked-at: block-height
        }
      )
    )

    (print
      {
        event: "lock-extended",
        user: caller,
        old-unlock: current-unlock,
        new-unlock: new-unlock,
        duration-extended: duration
      }
    )

    (ok true)
  )
)

;; Increase lock amount
;; Add more tokens to existing lock
(define-public (increase-amount (amount uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (lock (unwrap! (map-get? locks caller) ERR-NO-LOCK-FOUND))
      (current-amount (get amount lock))
      (new-amount (+ current-amount amount))
    )
    ;; Validate parameters
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Check if lock is still active
    (asserts! (< block-height (get unlock-height lock)) ERR-LOCK-EXPIRED)

    ;; Transfer additional tokens from user to this contract
    (try! (contract-call? token transfer amount caller (as-contract tx-sender) none))

    ;; Update lock
    (map-set locks
      caller
      (merge lock
        {
          amount: new-amount,
          locked-at: block-height
        }
      )
    )

    ;; Update total locked
    (var-set total-locked (+ (var-get total-locked) amount))

    (print
      {
        event: "amount-increased",
        user: caller,
        old-amount: current-amount,
        new-amount: new-amount,
        added-amount: amount
      }
    )

    (ok true)
  )
)

;; Extend lock and increase amount in one transaction
(define-public (extend-and-increase (duration uint) (amount uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (lock (unwrap! (map-get? locks caller) ERR-NO-LOCK-FOUND))
      (current-amount (get amount lock))
      (current-unlock (get unlock-height lock))
      (new-amount (+ current-amount amount))
      (new-unlock (+ current-unlock duration))
    )
    ;; Validate parameters
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= duration MIN-LOCK-DURATION) ERR-INVALID-DURATION)
    (asserts! (<= (- new-unlock block-height) MAX-LOCK-DURATION) ERR-INVALID-DURATION)

    ;; Check if lock is still active or recently expired
    (asserts! (>= block-height (- current-unlock MIN-LOCK-DURATION)) ERR-LOCK-EXPIRED)

    ;; Transfer additional tokens from user to this contract
    (try! (contract-call? token transfer amount caller (as-contract tx-sender) none))

    ;; Update lock
    (map-set locks
      caller
      (merge lock
        {
          amount: new-amount,
          unlock-height: new-unlock,
          locked-at: block-height
        }
      )
    )

    ;; Update total locked
    (var-set total-locked (+ (var-get total-locked) amount))

    (print
      {
        event: "lock-extended-and-increased",
        user: caller,
        old-amount: current-amount,
        new-amount: new-amount,
        added-amount: amount,
        old-unlock: current-unlock,
        new-unlock: new-unlock,
        duration-extended: duration
      }
    )

    (ok true)
  )
)

;; Withdraw tokens after lock expires
(define-public (withdraw (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (lock (unwrap! (map-get? locks caller) ERR-NO-LOCK-FOUND))
      (locked-amount (get amount lock))
      (unlock-height (get unlock-height lock))
    )
    ;; Check if lock has expired
    (asserts! (>= block-height unlock-height) ERR-LOCK-NOT-EXPIRED)

    ;; Transfer tokens back to user
    (try! (as-contract (contract-call? token transfer locked-amount tx-sender caller none)))

    ;; Remove lock
    (map-delete locks caller)

    ;; Update total locked
    (var-set total-locked (- (var-get total-locked) locked-amount))

    (print
      {
        event: "tokens-withdrawn",
        user: caller,
        amount: locked-amount,
        unlock-height: unlock-height
      }
    )

    (ok locked-amount)
  )
)

;; Emergency withdraw by contract owner (for protocol upgrades or fixes)
;; This is a safety measure and should be used very carefully
(define-public (emergency-withdraw (user principal) (amount uint) (token <sip-010-trait>))
  (let
    (
      (caller contract-caller)
      (lock (unwrap! (map-get? locks user) ERR-NO-LOCK-FOUND))
      (locked-amount (get amount lock))
      (unlock-height (get unlock-height lock))
    )
    ;; Only contract owner can call this
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check if lock has expired
    (asserts! (>= block-height unlock-height) ERR-LOCK-NOT-EXPIRED)

    ;; Validate amount
    (asserts! (<= amount locked-amount) ERR-INSUFFICIENT-BALANCE)

    ;; Transfer tokens to user
    (try! (as-contract (contract-call? token transfer amount tx-sender user none)))

    ;; Update or remove lock
    (if (is-eq amount locked-amount)
      (begin
        (map-delete locks user)
        (var-set total-locked (- (var-get total-locked) locked-amount))
      )
      (begin
        (map-set locks
          user
          (merge lock { amount: (- locked-amount amount) })
        )
        (var-set total-locked (- (var-get total-locked) amount))
      )
    )

    (print
      {
        event: "emergency-withdraw",
        user: user,
        amount: amount,
        remaining: (- locked-amount amount),
        unlock-height: unlock-height
      }
    )

    (ok amount)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Get total locked supply
(define-read-only (get-total-locked)
  (ok (var-get total-locked))
)
