;; Vesting Vault Contract for StackPredict Protocol
;; Handles token vesting for team, investors, and early contributors
;; Supports cliff periods and linear unlock schedules

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u600))
(define-constant ERR-ZERO-AMOUNT (err u601))
(define-constant ERR-ALREADY-VESTED (err u602))
(define-constant ERR-NO-VESTING-FOUND (err u603))
(define-constant ERR-CLIFF-NOT-REACHED (err u604))
(define-constant ERR-INSUFFICIENT-CLAIMABLE (err u605))
(define-constant ERR-INVALID-SCHEDULE (err u606))
(define-constant ERR-ALREADY-CLAIMED (err u607))
(define-constant ERR-ALREADY-REVOKED (err u608))

;; Vesting Schedule Structure
;; - beneficiary: The address receiving vested tokens
;; - total-amount: Total tokens to vest
;; - claimed-amount: Tokens already claimed
;; - start-block: Block height when vesting starts
;; - cliff-duration: Number of blocks before cliff (no tokens can be claimed)
;; - vesting-duration: Number of blocks over which tokens vest linearly
;; - is-revoked: Whether the vesting schedule has been revoked
(define-map vesting-schedules
  uint
  {
    beneficiary: principal,
    total-amount: uint,
    claimed-amount: uint,
    start-block: uint,
    cliff-duration: uint,
    vesting-duration: uint,
    is-revoked: bool
  }
)

;; Track vesting schedules by beneficiary
(define-map beneficiary-schedules principal (list 20 uint))

;; Sequential vesting schedule ID counter
(define-data-var schedule-id-counter uint u1)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get a specific vesting schedule by ID
(define-read-only (get-vesting-schedule (schedule-id uint))
  (match (map-get? vesting-schedules schedule-id)
    schedule (ok schedule)
    ERR-NO-VESTING-FOUND
  )
)

;; Get all vesting schedule IDs for a beneficiary
(define-read-only (get-beneficiary-schedules (beneficiary principal))
  (ok (default-to (list) (map-get? beneficiary-schedules beneficiary)))
)

;; Calculate the amount of tokens that can be claimed right now
;; Formula: If current block < start + cliff: 0
;;          If current block >= start + cliff + vesting: total-amount
;;          Otherwise: claimed-amount + (total-amount - claimed-amount) * (elapsed - cliff) / vesting-duration
(define-read-only (get-claimable-amount (schedule-id uint))
  (match (map-get? vesting-schedules schedule-id)
    schedule
    (let
      (
        (beneficiary (get beneficiary schedule))
        (total-amount (get total-amount schedule))
        (claimed-amount (get claimed-amount schedule))
        (start-block (get start-block schedule))
        (cliff-duration (get cliff-duration schedule))
        (vesting-duration (get vesting-duration schedule))
        (is-revoked (get is-revoked schedule))
        (current-block block-height)
      )
      ;; If revoked, no tokens can be claimed
      (if is-revoked
        (ok u0)
        (let
          (
            (cliff-end (+ start-block cliff-duration))
            (vesting-end (+ cliff-end vesting-duration))
          )
          ;; Check current block against vesting schedule
          (if (< current-block cliff-end)
            ;; Before cliff: nothing claimable
            (ok u0)
            (if (>= current-block vesting-end)
              ;; After vesting: all remaining tokens claimable
              (ok (- total-amount claimed-amount))
              ;; During vesting: linear unlock
              (let
                (
                  (elapsed (- current-block cliff-end))
                  (vested-amount (/ (* total-amount elapsed) vesting-duration))
                  (remaining (- vested-amount claimed-amount))
                )
                (if (> remaining u0)
                  (ok remaining)
                  (ok u0)
                )
              )
            )
          )
        )
      )
    )
    ERR-NO-VESTING-FOUND
  )
)

;; Check if a schedule is fully vested
(define-read-only (is-fully-vested (schedule-id uint))
  (match (map-get? vesting-schedules schedule-id)
    schedule
    (let
      (
        (total-amount (get total-amount schedule))
        (claimed-amount (get claimed-amount schedule))
        (is-revoked (get is-revoked schedule))
      )
      (ok (or is-revoked (>= claimed-amount total-amount)))
    )
    ERR-NO-VESTING-FOUND
  )
)

;; Get total vested amount for a schedule (including claimed)
(define-read-only (get-total-vested (schedule-id uint))
  (match (map-get? vesting-schedules schedule-id)
    schedule
    (let
      (
        (total-amount (get total-amount schedule))
        (start-block (get start-block schedule))
        (cliff-duration (get cliff-duration schedule))
        (vesting-duration (get vesting-duration schedule))
        (is-revoked (get is-revoked schedule))
        (current-block block-height)
      )
      (if is-revoked
        (ok u0)
        (let
          (
            (cliff-end (+ start-block cliff-duration))
            (vesting-end (+ cliff-end vesting-duration))
          )
          ;; Check current block against vesting schedule
          (if (< current-block cliff-end)
            (ok u0)
            (if (>= current-block vesting-end)
              (ok total-amount)
              (let
                (
                  (elapsed (- current-block cliff-end))
                  (vested-amount (/ (* total-amount elapsed) vesting-duration))
                )
                (ok vested-amount)
              )
            )
          )
        )
      )
    )
    ERR-NO-VESTING-FOUND
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Create a new vesting schedule
;; Only callable by contract owner (e.g., governance or admin)
;; Parameters:
;; - beneficiary: The address receiving tokens
;; - total-amount: Total tokens to vest
;; - start-block: Block when vesting begins (can be in future)
;; - cliff-duration: Blocks before any tokens can be claimed (e.g., 525600 = ~1 year)
;; - vesting-duration: Blocks over which tokens vest linearly (e.g., 1051200 = ~2 years)
(define-public (create-vesting-schedule
    (beneficiary principal)
    (total-amount uint)
    (start-block uint)
    (cliff-duration uint)
    (vesting-duration uint)
  )
  (let
    (
      (schedule-id (var-get schedule-id-counter))
      (caller contract-caller)
    )
    ;; Only contract owner can create vesting schedules
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Validate parameters
    (asserts! (> total-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (> vesting-duration u0) ERR-INVALID-SCHEDULE)
    (asserts! (>= start-block block-height) ERR-INVALID-SCHEDULE)

    ;; Store the vesting schedule
    (map-set vesting-schedules
      schedule-id
      {
        beneficiary: beneficiary,
        total-amount: total-amount,
        claimed-amount: u0,
        start-block: start-block,
        cliff-duration: cliff-duration,
        vesting-duration: vesting-duration,
        is-revoked: false
      }
    )

    ;; Add schedule ID to beneficiary's list
    (let
      (
        (current-schedules (default-to (list) (map-get? beneficiary-schedules beneficiary)))
        (new-schedules (unwrap! (as-max-len? (append current-schedules schedule-id) u20) ERR-INVALID-SCHEDULE))
      )
      (map-set beneficiary-schedules beneficiary new-schedules)
    )

    ;; Increment schedule ID counter
    (var-set schedule-id-counter (+ schedule-id u1))

    (print
      {
        event: "vesting-schedule-created",
        schedule-id: schedule-id,
        beneficiary: beneficiary,
        total-amount: total-amount,
        start-block: start-block,
        cliff-duration: cliff-duration,
        vesting-duration: vesting-duration
      }
    )

    (ok schedule-id)
  )
)

;; Claim vested tokens
;; Can be called by the beneficiary or on their behalf
(define-public (claim (schedule-id uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (schedule (unwrap! (map-get? vesting-schedules schedule-id) ERR-NO-VESTING-FOUND))
      (beneficiary (get beneficiary schedule))
      (total-amount (get total-amount schedule))
      (claimed-amount (get claimed-amount schedule))
      (is-revoked (get is-revoked schedule))
    )
    ;; Only beneficiary can claim (or contract owner if revoked)
    (asserts! (or (is-eq caller beneficiary) (and is-revoked (is-eq caller CONTRACT-OWNER))) ERR-NOT-AUTHORIZED)

    ;; Check if schedule is revoked
    (asserts! (not is-revoked) ERR-ALREADY-VESTED)

    ;; Calculate claimable amount
    (let
      (
        (claimable (try! (get-claimable-amount schedule-id)))
      )
      (asserts! (> claimable u0) ERR-INSUFFICIENT-CLAIMABLE)

      ;; Update claimed amount
      (map-set vesting-schedules
        schedule-id
        (merge schedule { claimed-amount: (+ claimed-amount claimable) })
      )

      ;; Transfer tokens to beneficiary
      (try! (as-contract (contract-call? token transfer claimable tx-sender beneficiary none)))

      (print
        {
          event: "vesting-claim",
          schedule-id: schedule-id,
          beneficiary: beneficiary,
          amount: claimable,
          remaining: (- total-amount (+ claimed-amount claimable))
        }
      )

      (ok claimable)
    )
  )
)

;; Revoke a vesting schedule
;; Only callable by contract owner
;; After revocation, remaining unvested tokens are returned to contract owner
(define-public (revoke-schedule (schedule-id uint) (token <sip-010-trait>))
  (let
    (
      (caller contract-caller)
      (schedule (unwrap! (map-get? vesting-schedules schedule-id) ERR-NO-VESTING-FOUND))
      (beneficiary (get beneficiary schedule))
      (total-amount (get total-amount schedule))
      (claimed-amount (get claimed-amount schedule))
      (is-revoked (get is-revoked schedule))
    )
    ;; Only contract owner can revoke
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check if already revoked
    (asserts! (not is-revoked) ERR-ALREADY-REVOKED)

    ;; Calculate remaining unvested tokens
    (let
      (
        (vested-amount (try! (get-total-vested schedule-id)))
        (unvested-amount (- total-amount vested-amount))
      )
      ;; Mark as revoked
      (map-set vesting-schedules
        schedule-id
        (merge schedule { is-revoked: true })
      )

      ;; Return unvested tokens to contract owner
      (if (> unvested-amount u0)
        (try! (as-contract (contract-call? token transfer unvested-amount tx-sender CONTRACT-OWNER none)))
        true
      )

      (print
        {
          event: "vesting-schedule-revoked",
          schedule-id: schedule-id,
          beneficiary: beneficiary,
          total-amount: total-amount,
          claimed-amount: claimed-amount,
          unvested-returned: unvested-amount
        }
      )

      (ok { revoked: true, unvested-returned: unvested-amount })
    )
  )
)

;; Emergency claim for revoked schedules
;; Allows contract owner to claim remaining tokens on behalf of revoked beneficiary
(define-public (claim-revoked (schedule-id uint) (token <sip-010-trait>))
  (let
    (
      (caller contract-caller)
      (schedule (unwrap! (map-get? vesting-schedules schedule-id) ERR-NO-VESTING-FOUND))
      (beneficiary (get beneficiary schedule))
      (total-amount (get total-amount schedule))
      (claimed-amount (get claimed-amount schedule))
      (is-revoked (get is-revoked schedule))
    )
    ;; Only contract owner can claim revoked tokens
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check if schedule is revoked
    (asserts! is-revoked ERR-NOT-AUTHORIZED)

    ;; Calculate remaining tokens
    (let
      (
        (remaining (- total-amount claimed-amount))
      )
      (asserts! (> remaining u0) ERR-INSUFFICIENT-CLAIMABLE)

      ;; Update claimed amount to total
      (map-set vesting-schedules
        schedule-id
        (merge schedule { claimed-amount: total-amount })
      )

      ;; Transfer remaining tokens to contract owner
      (try! (as-contract (contract-call? token transfer remaining tx-sender CONTRACT-OWNER none)))

      (print
        {
          event: "revoked-claim",
          schedule-id: schedule-id,
          beneficiary: beneficiary,
          amount-claimed: remaining
        }
      )

      (ok remaining)
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Get current schedule ID counter (for debugging/verification)
(define-read-only (get-schedule-id-counter)
  (ok (var-get schedule-id-counter))
)
