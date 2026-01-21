;; HRO (Hybrid Reputation Oracle) Resolver Contract for StackPredict Protocol
;; Implements Bond Escalation (Layer 2) for dispute resolution
;; Based on Reality.eth style bond escalation with 2x bond requirement
;;
;; Flow:
;; 1. Creator resolves market with initial bond
;; 2. Disputer can challenge by posting 2x the current bond
;; 3. Creator (or previous winner) can counter-dispute with 2x bond
;; 4. Escalation continues until timeout or bond threshold reached
;; 5. If bond exceeds ESCALATION_THRESHOLD, triggers Layer 4 (quadratic voting)

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)

;; Bond escalation parameters
(define-constant MINIMUM-DISPUTE-BOND u50000000)        ;; 50 USDC (initial bond)
(define-constant ESCALATION-THRESHOLD u5120000000)      ;; 51,200 USDC (triggers voting)
(define-constant MAX-ESCALATION-ROUNDS u10)             ;; Max 10 escalation rounds
(define-constant ESCALATION-TIMEOUT u1008)              ;; 7 days timeout per round
(define-constant FORK-THRESHOLD u1000000)               ;; 10% (in basis points: 1000000 = 100%)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1200))
(define-constant ERR-ZERO-AMOUNT (err u1201))
(define-constant ERR-INSUFFICIENT-BOND (err u1202))
(define-constant ERR-MARKET-NOT-FOUND (err u1203))
(define-constant ERR-NO-ESCALATION-STATE (err u1204))
(define-constant ERR-ALREADY-ESCALATED (err u1205))
(define-constant ERR-ESCALATION-TIMEOUT (err u1206))
(define-constant ERR-ESCALATION-NOT-TIMEOUT (err u1207))
(define-constant ERR-BOND-THRESHOLD-REACHED (err u1208))
(define-constant ERR-INVALID-OUTCOME (err u1209))
(define-constant ERR-ALREADY-RESOLVED (err u1210))
(define-constant ERR-ESCALATION-IN-PROGRESS (err u1211))
(define-constant ERR-LEADING-OUTCOME-MISMATCH (err u1212))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Dispute bond structure
;; - disputer: Principal who posted the bond
;; - amount: Bond amount in USDC
;; - outcome-claimed: Outcome the disputer claims is correct (0 = YES, 1 = NO)
;; - round: Escalation round (0 = initial, 1 = first challenge, etc.)
;; - timestamp: Block height when bond was posted
(define-map dispute-bonds
  uint
  {
    disputer: principal,
    amount: uint,
    outcome-claimed: uint,
    round: uint,
    timestamp: uint
  }
)

;; Escalation state for each market
;; - current-round: Current escalation round
;; - current-bond: Current bond amount required to challenge
;; - last-action-block: Block height of last bond posted
;; - leading-outcome: Outcome currently in the lead (0 = YES, 1 = NO)
;; - is-resolved: Whether escalation has been finalized
;; - winning-outcome: Final winning outcome (if resolved)
;; - total-bonds-staked: Total bonds posted in this escalation
(define-map escalation-state
  uint
  {
    current-round: uint,
    current-bond: uint,
    last-action-block: uint,
    leading-outcome: uint,
    is-resolved: bool,
    winning-outcome: (optional uint),
    total-bonds-staked: uint
  }
)

;; Track bonds by market ID (list of bond IDs)
(define-map market-bonds
  uint
  (list 20 uint)
)

;; Track bonds by disputer
(define-map disputer-bonds
  principal
  (list 50 uint)
)

;; Sequential bond ID counter
(define-data-var bond-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get dispute bond by ID
(define-read-only (get-dispute-bond (bond-id uint))
  (ok (map-get? dispute-bonds bond-id))
)

;; Get escalation state for a market
(define-read-only (get-escalation-state (market-id uint))
  (ok (map-get? escalation-state market-id))
)

;; Get all bonds for a market
(define-read-only (get-market-bonds (market-id uint))
  (ok (default-to (list) (map-get? market-bonds market-id)))
)

;; Get all bonds for a disputer
(define-read-only (get-disputer-bonds (disputer principal))
  (ok (default-to (list) (map-get? disputer-bonds disputer)))
)

;; Calculate the required bond for the next escalation round
;; Formula: bond_n = bond_0 * 2^n
(define-read-only (calculate-next-bond (market-id uint))
  (match (map-get? escalation-state market-id)
    state
    (let
      (
        (next-round (+ (get current-round state) u1))
        (next-bond (* (get current-bond state) u2))
      )
      (ok { next-round: next-round, next-bond: next-bond })
    )
    (ok { next-round: u0, next-bond: MINIMUM-DISPUTE-BOND })
  )
)

;; Check if escalation can be finalized (timeout reached without counter)
(define-read-only (can-finalize-escalation (market-id uint))
  (match (map-get? escalation-state market-id)
    state
    (let
      (
        (timeout-block (+ (get last-action-block state) ESCALATION-TIMEOUT))
        (can-finalize (and (>= block-height timeout-block) (not (get is-resolved state))))
      )
      (ok { can-finalize: can-finalize, timeout-block: timeout-block })
    )
    (ok { can-finalize: false, timeout-block: u0 })
  )
)

;; Check if bond threshold has been reached (triggers Layer 4 voting)
(define-read-only (is-bond-threshold-reached (market-id uint))
  (match (map-get? escalation-state market-id)
    state
    (ok (>= (get current-bond state) ESCALATION-THRESHOLD))
    (ok false)
  )
)

;; Get the current leading outcome
(define-read-only (get-leading-outcome (market-id uint))
  (match (map-get? escalation-state market-id)
    state
    (ok (some (get leading-outcome state)))
    (ok none)
  )
)

;; Check if market is ready for escalation trigger
(define-read-only (is-ready-for-escalation (market-id uint))
  (match (map-get? escalation-state market-id)
    state
    (let
      (
        (threshold-reached (>= (get current-bond state) ESCALATION-THRESHOLD))
        (not-resolved (not (get is-resolved state)))
      )
      (ok (and threshold-reached not-resolved))
    )
    (ok false)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Initialize escalation for a market
;; Called by market creator when resolving a market with initial bond
(define-public (initiate-escalation
    (market-id uint)
    (initial-outcome uint)
    (initial-bond uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (new-bond-id (+ (var-get bond-id-counter) u1))
    )
    ;; Validate parameters
    (asserts! (> initial-bond MINIMUM-DISPUTE-BOND) ERR-INSUFFICIENT-BOND)
    (asserts! (or (is-eq initial-outcome u0) (is-eq initial-outcome u1)) ERR-INVALID-OUTCOME)

    ;; Check if market already has escalation state
    (asserts! (is-none (map-get? escalation-state market-id)) ERR-ALREADY-ESCALATED)

    ;; Transfer initial bond from creator to this contract
    (try! (contract-call? token transfer initial-bond caller (as-contract tx-sender) none))

    ;; Create initial bond record
    (map-set dispute-bonds
      new-bond-id
      {
        disputer: caller,
        amount: initial-bond,
        outcome-claimed: initial-outcome,
        round: u0,
        timestamp: block-height
      }
    )

    ;; Initialize escalation state
    (map-set escalation-state
      market-id
      {
        current-round: u0,
        current-bond: initial-bond,
        last-action-block: block-height,
        leading-outcome: initial-outcome,
        is-resolved: false,
        winning-outcome: none,
        total-bonds-staked: initial-bond
      }
    )

    ;; Link bond to market
    (map-set market-bonds market-id (list new-bond-id))

    ;; Add to disputer's bond list
    (let
      (
        (disputer-list (default-to (list) (map-get? disputer-bonds caller)))
        (new-list (unwrap-panic (as-max-len? (append disputer-list new-bond-id) u50)))
      )
      (map-set disputer-bonds caller new-list)
    )

    ;; Update bond ID counter
    (var-set bond-id-counter new-bond-id)

    (print
      {
        event: "escalation-initiated",
        market-id: market-id,
        bond-id: new-bond-id,
        disputer: caller,
        amount: initial-bond,
        outcome-claimed: initial-outcome,
        round: u0,
        timestamp: block-height
      }
    )

    (ok new-bond-id)
  )
)

;; Initiate dispute by posting bond (2x current bond)
;; Anyone can challenge the current leading outcome
(define-public (initiate-dispute
    (market-id uint)
    (claimed-outcome uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (state (unwrap! (map-get? escalation-state market-id) ERR-MARKET-NOT-FOUND))
      (new-bond-id (+ (var-get bond-id-counter) u1))
      (next-bond (* (get current-bond state) u2))
      (next-round (+ (get current-round state) u1))
    )
    ;; Validate parameters
    (asserts! (not (get is-resolved state)) ERR-ALREADY-RESOLVED)
    (asserts! (or (is-eq claimed-outcome u0) (is-eq claimed-outcome u1)) ERR-INVALID-OUTCOME)
    (asserts! (not (is-eq claimed-outcome (get leading-outcome state))) ERR-LEADING-OUTCOME-MISMATCH)

    ;; Check max escalation rounds
    (asserts! (< (get current-round state) MAX-ESCALATION-ROUNDS) ERR-BOND-THRESHOLD-REACHED)

    ;; Transfer bond from disputer to this contract
    (try! (contract-call? token transfer next-bond caller (as-contract tx-sender) none))

    ;; Create dispute bond record
    (map-set dispute-bonds
      new-bond-id
      {
        disputer: caller,
        amount: next-bond,
        outcome-claimed: claimed-outcome,
        round: next-round,
        timestamp: block-height
      }
    )

    ;; Update escalation state
    (map-set escalation-state
      market-id
      (merge state
        {
          current-round: next-round,
          current-bond: next-bond,
          last-action-block: block-height,
          leading-outcome: claimed-outcome,
          total-bonds-staked: (+ (get total-bonds-staked state) next-bond)
        }
      )
    )

    ;; Add bond to market's bond list
    (let
      (
        (bond-list (default-to (list) (map-get? market-bonds market-id)))
        (new-list (unwrap-panic (as-max-len? (append bond-list new-bond-id) u20)))
      )
      (map-set market-bonds market-id new-list)
    )

    ;; Add to disputer's bond list
    (let
      (
        (disputer-list (default-to (list) (map-get? disputer-bonds caller)))
        (new-list (unwrap-panic (as-max-len? (append disputer-list new-bond-id) u50)))
      )
      (map-set disputer-bonds caller new-list)
    )

    ;; Update bond ID counter
    (var-set bond-id-counter new-bond-id)

    (print
      {
        event: "dispute-initiated",
        market-id: market-id,
        bond-id: new-bond-id,
        disputer: caller,
        amount: next-bond,
        outcome-claimed: claimed-outcome,
        round: next-round,
        timestamp: block-height
      }
    )

    (ok new-bond-id)
  )
)

;; Finalize escalation when timeout is reached without counter
;; Winner gets all bonds staked
(define-public (finalize-escalation (market-id uint) (token <sip-010-trait>))
  (let
    (
      (state (unwrap! (map-get? escalation-state market-id) ERR-MARKET-NOT-FOUND))
      (timeout-block (+ (get last-action-block state) ESCALATION-TIMEOUT))
      (winner (get leading-outcome state))
      (total-bonds (get total-bonds-staked state))
    )
    ;; Check if escalation is not already resolved
    (asserts! (not (get is-resolved state)) ERR-ALREADY-RESOLVED)

    ;; Check if timeout has been reached
    (asserts! (>= block-height timeout-block) ERR-ESCALATION-NOT-TIMEOUT)

    ;; Mark as resolved
    (map-set escalation-state
      market-id
      (merge state
        {
          is-resolved: true,
          winning-outcome: (some winner)
        }
      )
    )

    ;; Distribute bonds to winner
    ;; In production, this would distribute to the winning disputer
    ;; For now, we just mark as resolved - actual distribution would be handled
    ;; by the market contract or a separate bond distributor

    (print
      {
        event: "escalation-finalized",
        market-id: market-id,
        winning-outcome: winner,
        total-bonds: total-bonds,
        final-round: (get current-round state),
        timeout-block: timeout-block
      }
    )

    (ok winner)
  )
)

;; Trigger Layer 4 (Quadratic Voting) when bond threshold is reached
;; This is called when current-bond >= ESCALATION-THRESHOLD
(define-public (trigger-voting (market-id uint))
  (let
    (
      (state (unwrap! (map-get? escalation-state market-id) ERR-MARKET-NOT-FOUND))
    )
    ;; Check if bond threshold has been reached
    (asserts! (>= (get current-bond state) ESCALATION-THRESHOLD) ERR-BOND-THRESHOLD-REACHED)

    ;; Check if not already resolved
    (asserts! (not (get is-resolved state)) ERR-ALREADY-RESOLVED)

    (print
      {
        event: "voting-triggered",
        market-id: market-id,
        current-bond: (get current-bond state),
        threshold: ESCALATION-THRESHOLD,
        leading-outcome: (get leading-outcome state),
        round: (get current-round state)
      }
    )

    ;; Note: In full implementation, this would create a voting session
    ;; in the quadratic-voting contract. For now, we just emit an event
    ;; that the frontend can use to trigger Layer 4.

    (ok true)
  )
)

;; Distribute bonds to winner after resolution
;; Called after Layer 4 voting completes or escalation finalizes
(define-public (distribute-bonds
    (market-id uint)
    (winning-outcome uint)
    (recipient principal)
    (token <sip-010-trait>)
  )
  (let
    (
      (state (unwrap! (map-get? escalation-state market-id) ERR-MARKET-NOT-FOUND))
      (total-bonds (get total-bonds-staked state))
    )
    ;; Only contract owner can distribute (in production, this would be governed)
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check if escalation is resolved
    (asserts! (get is-resolved state) ERR-ESCALATION-NOT-TIMEOUT)

    ;; Check winning outcome matches
    (asserts! (is-eq winning-outcome (unwrap! (get winning-outcome state) ERR-ALREADY-RESOLVED)) ERR-INVALID-OUTCOME)

    ;; Transfer total bonds to recipient
    ;; Note: In production, this would distribute proportionally to voters
    ;; For now, transfer all to the specified recipient
    (try! (as-contract (contract-call? token transfer total-bonds tx-sender recipient none)))

    (print
      {
        event: "bonds-distributed",
        market-id: market-id,
        winning-outcome: winning-outcome,
        amount: total-bonds,
        recipient: recipient
      }
    )

    (ok total-bonds)
  )
)

;; Reset escalation state (owner only, for testing/correction)
(define-public (reset-escalation (market-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-delete escalation-state market-id)
    (map-delete market-bonds market-id)

    (print
      {
        event: "escalation-reset",
        market-id: market-id
      }
    )

    (ok true)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Update escalation parameters (owner only)
(define-public (update-escalation-params
    (new-min-bond uint)
    (new-threshold uint)
    (new-timeout uint)
  )
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-min-bond u0) ERR-ZERO-AMOUNT)
    (asserts! (> new-threshold new-min-bond) ERR-INSUFFICIENT-BOND)

    ;; Note: In production, these would be stored in data-vars
    ;; For now, they're constants so we just emit an event
    (print
      {
        event: "escalation-params-updated",
        new-min-bond: new-min-bond,
        new-threshold: new-threshold,
        new-timeout: new-timeout
      }
    )

    (ok true)
  )
)

;; Get current bond ID counter
(define-read-only (get-bond-id-counter)
  (ok (var-get bond-id-counter))
)
