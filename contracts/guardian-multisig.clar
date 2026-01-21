;; Guardian Multisig Contract for StackPredict Protocol
;; Emergency pause mechanism controlled by a multisig of trusted guardians
;; Can pause contracts for critical emergencies but CANNOT change parameters

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-GUARDIANS u5) ;; Maximum number of guardians
(define-constant MIN-APPROVALS u3) ;; Minimum approvals required for emergency action
(define-constant PAUSE-DURATION u1008) ;; ~7 days pause duration (144 blocks/day * 7)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1500))
(define-constant ERR-ZERO-ADDRESS (err u1501))
(define-constant ERR-MAX-GUARDIANS-REACHED (err u1502))
(define-constant ERR-GUARDIAN-NOT-FOUND (err u1503))
(define-constant ERR-ALREADY-PAUSED (err u1504))
(define-constant ERR-NOT-PAUSED (err u1505))
(define-constant ERR-PAUSE-NOT-EXPIRED (err u1506))
(define-constant ERR-ALREADY-VOTED (err u1507))
(define-constant ERR-INVALID-PAUSE-TARGET (err u1509))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Guardian list (principals) - indexed by guardian ID (1 to MAX-GUARDIANS)
(define-map guardians
  uint
  principal
)

;; Track guardian approvals for pause actions
(define-map pause-approvals
  { pause-id: uint, guardian: principal }
  bool
)

;; Pause action structure
(define-map pause-actions
  uint
  {
    target-contract: (optional principal),
    reason: (string-utf8 256),
    initiated-by: principal,
    initiated-at: uint,
    approvals: uint,
    is-active: bool,
    is-executed: bool,
    expires-at: (optional uint)
  }
)

;; Track pause IDs by target contract (for quick lookup)
(define-map contract-pauses
  (optional principal)
  (list 10 uint)
)

;; Sequential pause ID counter
(define-data-var pause-id-counter uint u0)

;; Sequential guardian ID counter
(define-data-var guardian-id-counter uint u0)

;; ============================================
;; ADMIN FUNCTIONS (Owner Only)
;; ============================================

;; Add a guardian to the multisig
(define-public (add-guardian (guardian principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-eq guardian tx-sender)) ERR-ZERO-ADDRESS)
    (asserts! (< (var-get guardian-id-counter) MAX-GUARDIANS) ERR-MAX-GUARDIANS-REACHED)

    (let
      (
        (new-guardian-id (+ (var-get guardian-id-counter) u1))
      )
      (map-set guardians new-guardian-id guardian)
      (var-set guardian-id-counter new-guardian-id)

      (print
        {
          event: "guardian-added",
          guardian-id: new-guardian-id,
          guardian: guardian
        }
      )

      (ok new-guardian-id)
    )
  )
)

;; Remove a guardian from the multisig
(define-public (remove-guardian (guardian-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= guardian-id (var-get guardian-id-counter)) ERR-GUARDIAN-NOT-FOUND)

    (let
      (
        (guardian (map-get? guardians guardian-id))
      )
      (asserts! (is-some guardian) ERR-GUARDIAN-NOT-FOUND)

      (map-delete guardians guardian-id)

      (print
        {
          event: "guardian-removed",
          guardian-id: guardian-id,
          guardian: (unwrap-panic guardian)
        }
      )

      (ok true)
    )
  )
)

;; ============================================
;; GUARDIAN FUNCTIONS
;; ============================================

;; Initiate a pause action
(define-public (initiate-pause
    (target-contract (optional principal))
    (reason (string-utf8 256))
  )
  (let
    (
      (caller tx-sender)
      (new-pause-id (+ (var-get pause-id-counter) u1))
    )
    ;; Validate caller is a guardian
    (asserts! (is-guardian-internal caller) ERR-NOT-AUTHORIZED)

    ;; Create pause action
    (map-set pause-actions
      new-pause-id
      {
        target-contract: target-contract,
        reason: reason,
        initiated-by: caller,
        initiated-at: block-height,
        approvals: u1,
        is-active: false,
        is-executed: false,
        expires-at: none
      }
    )

    ;; Record approval from initiator
    (map-set pause-approvals
      { pause-id: new-pause-id, guardian: caller }
      true
    )

    ;; Add to contract's pause list
    (let
      (
        (existing-pauses (default-to (list) (map-get? contract-pauses target-contract)))
        (new-pauses (unwrap-panic (as-max-len? (append existing-pauses new-pause-id) u10)))
      )
      (map-set contract-pauses target-contract new-pauses)
    )

    ;; Update pause ID counter
    (var-set pause-id-counter new-pause-id)

    (print
      {
        event: "pause-initiated",
        pause-id: new-pause-id,
        target-contract: target-contract,
        reason: reason,
        initiated-by: caller,
        initiated-at: block-height
      }
    )

    (ok new-pause-id)
  )
)

;; Approve a pause action
(define-public (approve-pause (pause-id uint))
  (let
    (
      (caller tx-sender)
      (pause-action (unwrap! (map-get? pause-actions pause-id) ERR-INVALID-PAUSE-TARGET))
      (current-approvals (get approvals pause-action))
    )
    ;; Validate caller is a guardian
    (asserts! (is-guardian-internal caller) ERR-NOT-AUTHORIZED)

    ;; Check if pause already executed
    (asserts! (not (get is-executed pause-action)) ERR-ALREADY-PAUSED)

    ;; Check if already voted
    (asserts! (is-none (map-get? pause-approvals { pause-id: pause-id, guardian: caller })) ERR-ALREADY-VOTED)

    ;; Record approval
    (map-set pause-approvals
      { pause-id: pause-id, guardian: caller }
      true
    )

    ;; Update approval count
    (let
      (
        (new-approvals (+ current-approvals u1))
      )
      (map-set pause-actions
        pause-id
        (merge pause-action { approvals: new-approvals })
      )

      (print
        {
          event: "pause-approved",
          pause-id: pause-id,
          guardian: caller,
          approvals: new-approvals,
          required: MIN-APPROVALS
        }
      )

      ;; If enough approvals, execute the pause
      (if (>= new-approvals MIN-APPROVALS)
        (execute-pause pause-id)
        (ok true)
      )
    )
  )
)

;; Execute a pause action (called automatically when threshold reached)
(define-private (execute-pause (pause-id uint))
  (let
    (
      (pause-action (unwrap! (map-get? pause-actions pause-id) ERR-INVALID-PAUSE-TARGET))
      (target-contract (get target-contract pause-action))
      (expires-at (+ block-height PAUSE-DURATION))
    )
    ;; Mark as active and executed
    (map-set pause-actions
      pause-id
      (merge pause-action
        {
          is-active: true,
          is-executed: true,
          expires-at: (some expires-at)
        }
      )
    )

    (print
      {
        event: "pause-executed",
        pause-id: pause-id,
        target-contract: target-contract,
        initiated-by: (get initiated-by pause-action),
        reason: (get reason pause-action),
        expires-at: expires-at
      }
    )

    (ok true)
  )
)

;; Unpause a contract after pause duration expires
(define-public (unpause-contract (pause-id uint))
  (let
    (
      (pause-action (unwrap! (map-get? pause-actions pause-id) ERR-INVALID-PAUSE-TARGET))
    )
    ;; Check if pause is active
    (asserts! (get is-active pause-action) ERR-NOT-PAUSED)

    ;; Check if pause has expired
    (let
      (
        (expires-at (unwrap! (get expires-at pause-action) ERR-INVALID-PAUSE-TARGET))
      )
      (asserts! (>= block-height expires-at) ERR-PAUSE-NOT-EXPIRED)

      ;; Deactivate the pause
      (map-set pause-actions
        pause-id
        (merge pause-action { is-active: false })
      )

      (print
        {
          event: "contract-unpaused",
          pause-id: pause-id,
          target-contract: (get target-contract pause-action),
          expires-at: expires-at
        }
      )

      (ok true)
    )
  )
)

;; Cancel a pending pause (before execution)
(define-public (cancel-pause (pause-id uint))
  (let
    (
      (caller tx-sender)
      (pause-action (unwrap! (map-get? pause-actions pause-id) ERR-INVALID-PAUSE-TARGET))
    )
    ;; Only initiator can cancel
    (asserts! (is-eq caller (get initiated-by pause-action)) ERR-NOT-AUTHORIZED)

    ;; Check if not already executed
    (asserts! (not (get is-executed pause-action)) ERR-ALREADY-PAUSED)

    ;; Mark as cancelled
    (map-set pause-actions
      pause-id
      (merge pause-action { approvals: u0, is-executed: true })
    )

    (print
      {
        event: "pause-cancelled",
        pause-id: pause-id,
        cancelled-by: caller
      }
    )

    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Check if a principal is a guardian (returns bool for internal use)
(define-private (is-guardian-internal (who principal))
  (let
    (
      (guardian-count (var-get guardian-id-counter))
    )
    (check-guardian-1 who guardian-count)
  )
)

;; Check if a principal is a guardian (read-only wrapper for external calls)
(define-read-only (is-guardian (who principal))
  (ok (is-guardian-internal who))
)

;; Check guardian by ID (unrolled for Clarity compatibility)
(define-private (check-guardian-1 (who principal) (max-id uint))
  (if (>= max-id u1)
    (match (map-get? guardians u1)
      g1 (or (is-eq g1 who) (check-guardian-2 who max-id))
      (check-guardian-2 who max-id)
    )
    false
  )
)

(define-private (check-guardian-2 (who principal) (max-id uint))
  (if (>= max-id u2)
    (match (map-get? guardians u2)
      g2 (or (is-eq g2 who) (check-guardian-3 who max-id))
      (check-guardian-3 who max-id)
    )
    false
  )
)

(define-private (check-guardian-3 (who principal) (max-id uint))
  (if (>= max-id u3)
    (match (map-get? guardians u3)
      g3 (or (is-eq g3 who) (check-guardian-4 who max-id))
      (check-guardian-4 who max-id)
    )
    false
  )
)

(define-private (check-guardian-4 (who principal) (max-id uint))
  (if (>= max-id u4)
    (match (map-get? guardians u4)
      g4 (or (is-eq g4 who) (check-guardian-5 who max-id))
      (check-guardian-5 who max-id)
    )
    false
  )
)

(define-private (check-guardian-5 (who principal) (max-id uint))
  (if (>= max-id u5)
    (match (map-get? guardians u5)
      g5 (is-eq g5 who)
      false
    )
    false
  )
)

;; Get all guardians (returns list of guardian IDs)
(define-read-only (get-guardians)
  (let
    (
      (guardian-count (var-get guardian-id-counter))
    )
    (ok (collect-guardian-ids guardian-count (list)))
  )
)

;; Collect guardian IDs (unrolled for Clarity compatibility)
(define-private (collect-guardian-ids (max-id uint) (acc (list 5 uint)))
  (let
    (
      (with-1 (if (>= max-id u1) (unwrap-panic (as-max-len? (append acc u1) u5)) acc))
      (with-2 (if (>= max-id u2) (unwrap-panic (as-max-len? (append with-1 u2) u5)) with-1))
      (with-3 (if (>= max-id u3) (unwrap-panic (as-max-len? (append with-2 u3) u5)) with-2))
      (with-4 (if (>= max-id u4) (unwrap-panic (as-max-len? (append with-3 u4) u5)) with-3))
      (with-5 (if (>= max-id u5) (unwrap-panic (as-max-len? (append with-4 u5) u5)) with-4))
    )
    with-5
  )
)

;; Get guardian principal by ID
(define-read-only (get-guardian-by-id (guardian-id uint))
  (ok (map-get? guardians guardian-id))
)

;; Get pause action details
(define-read-only (get-pause-action (pause-id uint))
  (ok (map-get? pause-actions pause-id))
)

;; Get all pause IDs for a contract
(define-read-only (get-contract-pauses (target-contract (optional principal)))
  (ok (default-to (list) (map-get? contract-pauses target-contract)))
)

;; Check if a contract is currently paused
(define-read-only (is-contract-paused (target-contract (optional principal)))
  (let
    (
      (pause-ids (default-to (list) (map-get? contract-pauses target-contract)))
    )
    (ok (check-pause-active pause-ids))
  )
)

;; Check if any pause in the list is active (using fold)
(define-private (check-pause-active (pause-ids (list 10 uint)))
  (fold check-single-pause-active pause-ids false)
)

;; Helper: Check if a single pause ID is active, accumulate with OR
(define-private (check-single-pause-active (pause-id uint) (acc bool))
  (if acc
    true  ;; Short-circuit: already found an active pause
    (match (map-get? pause-actions pause-id)
      pause-action
      (if (get is-active pause-action)
        (match (get expires-at pause-action)
          expires
          (< block-height expires)  ;; Active if not expired
          true  ;; No expiry = always active
        )
        false
      )
      false  ;; Pause ID not found
    )
  )
)

;; Get pause status for a specific pause ID
(define-read-only (get-pause-status (pause-id uint))
  (match (map-get? pause-actions pause-id)
    pause-action
    (let
      (
        (is-expired (match (get expires-at pause-action)
          expires-at
          (>= block-height expires-at)
          false
        ))
      )
      (ok (some {
        pause-id: pause-id,
        target-contract: (get target-contract pause-action),
        is-active: (get is-active pause-action),
        is-executed: (get is-executed pause-action),
        approvals: (get approvals pause-action),
        expires-at: (get expires-at pause-action),
        is-expired: is-expired,
        can-unpause: (and (get is-active pause-action) is-expired)
      }))
    )
    (ok none)
  )
)

;; Get pause ID counter
(define-read-only (get-pause-id-counter)
  (ok (var-get pause-id-counter))
)

;; Get guardian ID counter
(define-read-only (get-guardian-id-counter)
  (ok (var-get guardian-id-counter))
)

;; Get constants
(define-read-only (get-max-guardians)
  (ok MAX-GUARDIANS)
)

(define-read-only (get-min-approvals)
  (ok MIN-APPROVALS)
)

(define-read-only (get-pause-duration)
  (ok PAUSE-DURATION)
)
