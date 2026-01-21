;; Quadratic Voting Contract for StackPredict Protocol
;; Implements Layer 4: Quadratic Reputation Voting
;; Handles voting sessions triggered by HRO bond escalation
;;
;; Features:
;; - Commit-reveal scheme to prevent last-minute vote manipulation
;; - Quadratic voting power calculation using reputation-registry
;; - Voting period with configurable duration
;; - Slash non-revealers (lose 10% of staked tokens)
;; - Tally votes with quadratic reputation weighting

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant VOTING-DURATION u432) ;; 3 days in blocks (144 blocks/day * 3)
(define-constant COMMIT-PHASE u288)    ;; 2 days for commit (144 blocks/day * 2)
(define-constant REVEAL-PHASE u144)    ;; 1 day for reveal (144 blocks/day * 1)
(define-constant SLASH-PERCENTAGE u100000) ;; 10% slash for non-revealers (100000 = 10%)
(define-constant MINIMUM-VOTE-POWER u1000000) ;; Minimum 1.0 vote power required

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1400))
(define-constant ERR-ZERO-AMOUNT (err u1401))
(define-constant ERR-INVALID-OUTCOME (err u1402))
(define-constant ERR-NO-VOTE-SESSION (err u1403))
(define-constant ERR-VOTING-NOT-STARTED (err u1404))
(define-constant ERR-VOTING-ENDED (err u1405))
(define-constant ERR-NOT-IN-COMMIT-PHASE (err u1406))
(define-constant ERR-NOT-IN-REVEAL-PHASE (err u1407))
(define-constant ERR-ALREADY-COMMITTED (err u1408))
(define-constant ERR-ALREADY-REVEALED (err u1409))
(define-constant ERR-NO-COMMITMENT-FOUND (err u1410))
(define-constant ERR-INVALID-REVEAL (err u1411))
(define-constant ERR-VOTE-ALREADY-TALLIED (err u1412))
(define-constant ERR-INSUFFICIENT-VOTE-POWER (err u1413))
(define-constant ERR-SESSION-NOT-ENDED (err u1414))
(define-constant ERR-ALREADY-ESCALATED (err u1415))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Voting session structure
;; - market-id: ID of the market being voted on
;; - start-block: Block height when voting starts
;; - end-block: Block height when voting ends
;; - commit-end: Block height when commit phase ends
;; - reveal-end: Block height when reveal phase ends
;; - total-votes-for-0: Total voting power for outcome 0
;; - total-votes-for-1: Total voting power for outcome 1
;; - is-tallied: Whether votes have been tallied
;; - winning-outcome: The winning outcome (0 or 1)
;; - total-staked: Total tokens staked in this session
(define-map voting-sessions
  uint
  {
    market-id: uint,
    start-block: uint,
    end-block: uint,
    commit-end: uint,
    reveal-end: uint,
    total-votes-for-0: uint,
    total-votes-for-1: uint,
    is-tallied: bool,
    winning-outcome: (optional uint),
    total-staked: uint
  }
)

;; Track sessions by market ID
(define-map market-session
  uint
  uint ;; session-id
)

;; Commitment structure
;; - session-id: Voting session ID
;; - voter: Principal who committed
;; - commitment: Hash of vote + salt
;; - tokens-staked: Amount of $PRED staked
;; - vote-power: Calculated quadratic voting power
;; - revealed: Whether the vote has been revealed
;; - slashed: Whether the voter was slashed for non-reveal
(define-map commitments
  { session-id: uint, voter: principal }
  {
    commitment: (buff 32),
    tokens-staked: uint,
    vote-power: uint,
    revealed: bool,
    slashed: bool
  }
)

;; Revealed vote structure (for transparency)
;; - session-id: Voting session ID
;; - voter: Principal who revealed
;; - outcome: Outcome voted for (0 or 1)
;; - vote-power: Voting power used
(define-map revealed-votes
  { session-id: uint, voter: principal }
  {
    outcome: uint,
    vote-power: uint
  }
)

;; Sequential session ID counter
(define-data-var session-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get voting session by ID
(define-read-only (get-voting-session (session-id uint))
  (ok (map-get? voting-sessions session-id))
)

;; Get session ID for a market
(define-read-only (get-market-session (market-id uint))
  (ok (map-get? market-session market-id))
)

;; Get commitment for a voter in a session
(define-read-only (get-commitment (session-id uint) (voter principal))
  (ok (map-get? commitments { session-id: session-id, voter: voter }))
)

;; Get revealed vote for a voter in a session
(define-read-only (get-revealed-vote (session-id uint) (voter principal))
  (ok (map-get? revealed-votes { session-id: session-id, voter: voter }))
)

;; Check if commit phase is active
(define-read-only (is-commit-phase (session-id uint))
  (match (map-get? voting-sessions session-id)
    session
    (let
      (
        (current-height block-height)
        (commit-end (get commit-end session))
      )
      (ok (and (>= current-height (get start-block session)) (< current-height commit-end)))
    )
    (ok false)
  )
)

;; Check if reveal phase is active
(define-read-only (is-reveal-phase (session-id uint))
  (match (map-get? voting-sessions session-id)
    session
    (let
      (
        (current-height block-height)
        (commit-end (get commit-end session))
        (reveal-end (get reveal-end session))
      )
      (ok (and (>= current-height commit-end) (< current-height reveal-end)))
    )
    (ok false)
  )
)

;; Check if voting session has ended
(define-read-only (is-voting-ended (session-id uint))
  (match (map-get? voting-sessions session-id)
    session
    (ok (>= block-height (get end-block session)))
    (ok false)
  )
)

;; Check if a voter has committed in a session
(define-read-only (has-committed (session-id uint) (voter principal))
  (ok (is-some (map-get? commitments { session-id: session-id, voter: voter })))
)

;; Check if a voter has revealed in a session
(define-read-only (has-revealed (session-id uint) (voter principal))
  (ok (is-some (map-get? revealed-votes { session-id: session-id, voter: voter })))
)

;; Calculate hash for commit-reveal scheme
;; Hash = sha256(concat(outcome-as-buff, salt))
;; outcome is converted to buff using uint-to-buff-be
(define-private (calculate-commitment (outcome uint) (salt (buff 32)))
  (let
    (
      ;; Convert outcome (0 or 1) to a 1-byte buffer
      (outcome-buff (if (is-eq outcome u0)
                        0x00
                        0x01
                      ))
    )
    (sha256 (concat outcome-buff salt))
  )
)

;; Get vote tally for a session
(define-read-only (get-vote-tally (session-id uint))
  (match (map-get? voting-sessions session-id)
    session
    (ok {
      votes-for-0: (get total-votes-for-0 session),
      votes-for-1: (get total-votes-for-1 session),
      total-staked: (get total-staked session),
      is-tallied: (get is-tallied session),
      winning-outcome: (get winning-outcome session)
    })
    (ok { votes-for-0: u0, votes-for-1: u0, total-staked: u0, is-tallied: false, winning-outcome: none })
  )
)

;; Get current session ID counter
(define-read-only (get-session-id-counter)
  (ok (var-get session-id-counter))
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Create a new voting session
;; Called by hro-resolver when bond threshold is reached
(define-public (create-voting-session
    (market-id uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller contract-caller)
      (new-session-id (+ (var-get session-id-counter) u1))
      (start-block (+ block-height u1)) ;; Start next block
      (commit-end (+ start-block COMMIT-PHASE))
      (reveal-end (+ commit-end REVEAL-PHASE))
      (end-block (+ start-block VOTING-DURATION))
    )
    ;; Only authorized contracts can call this (hro-resolver or owner)
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Check if market already has a session
    (asserts! (is-none (map-get? market-session market-id)) ERR-ALREADY-ESCALATED)

    ;; Create voting session
    (map-set voting-sessions
      new-session-id
      {
        market-id: market-id,
        start-block: start-block,
        end-block: end-block,
        commit-end: commit-end,
        reveal-end: reveal-end,
        total-votes-for-0: u0,
        total-votes-for-1: u0,
        is-tallied: false,
        winning-outcome: none,
        total-staked: u0
      }
    )

    ;; Link market to session
    (map-set market-session market-id new-session-id)

    ;; Update session ID counter
    (var-set session-id-counter new-session-id)

    (print
      {
        event: "voting-session-created",
        session-id: new-session-id,
        market-id: market-id,
        start-block: start-block,
        commit-end: commit-end,
        reveal-end: reveal-end,
        end-block: end-block
      }
    )

    (ok new-session-id)
  )
)

;; Commit vote (Phase 1: 2 days)
;; User commits hash(outcome + salt) and stakes tokens
(define-public (commit-vote
    (session-id uint)
    (commitment (buff 32))
    (tokens-staked uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (current-height block-height)
    )
    ;; Validate parameters
    (asserts! (> tokens-staked u0) ERR-ZERO-AMOUNT)

    ;; Check if commit phase is active
    (asserts! (>= current-height (get start-block session)) ERR-VOTING-NOT-STARTED)
    (asserts! (< current-height (get commit-end session)) ERR-NOT-IN-COMMIT-PHASE)

    ;; Check if voter already committed
    (asserts! (is-none (map-get? commitments { session-id: session-id, voter: caller })) ERR-ALREADY-COMMITTED)

    ;; Calculate voting power using reputation-registry
    ;; This uses quadratic formula: sqrt(tokens) * reputation * time_multiplier
    (let
      (
        (stake-duration (- (get end-block session) current-height))
        (vote-power-result (contract-call? .reputation-registry calculate-vote-power caller tokens-staked stake-duration))
        (vote-power (unwrap! vote-power-result ERR-INSUFFICIENT-VOTE-POWER))
      )
      ;; Check if voter has sufficient voting power
      (asserts! (>= vote-power MINIMUM-VOTE-POWER) ERR-INSUFFICIENT-VOTE-POWER)

      ;; Transfer tokens from voter to this contract
      (try! (contract-call? token transfer tokens-staked caller (as-contract tx-sender) none))

      ;; Record commitment
      (map-set commitments
        { session-id: session-id, voter: caller }
        {
          commitment: commitment,
          tokens-staked: tokens-staked,
          vote-power: vote-power,
          revealed: false,
          slashed: false
        }
      )

      ;; Update total staked in session
      (map-set voting-sessions
        session-id
        (merge session
          {
            total-staked: (+ (get total-staked session) tokens-staked)
          }
        )
      )

      ;; Record vote cast in reputation-registry
      (try! (contract-call? .reputation-registry record-vote-cast caller (get market-id session) tokens-staked))

      (print
        {
          event: "vote-committed",
          session-id: session-id,
          voter: caller,
          commitment: commitment,
          tokens-staked: tokens-staked,
          vote-power: vote-power
        }
      )

      (ok true)
    )
  )
)

;; Reveal vote (Phase 2: 1 day)
;; User reveals their vote and salt to prove commitment
(define-public (reveal-vote
    (session-id uint)
    (outcome uint)
    (salt (buff 32))
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (current-height block-height)
      (commitment-record (unwrap! (map-get? commitments { session-id: session-id, voter: caller }) ERR-NO-COMMITMENT-FOUND))
      (expected-commitment (calculate-commitment outcome salt))
    )
    ;; Validate parameters
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)

    ;; Check if reveal phase is active
    (asserts! (>= current-height (get commit-end session)) ERR-NOT-IN-REVEAL-PHASE)
    (asserts! (< current-height (get reveal-end session)) ERR-NOT-IN-REVEAL-PHASE)

    ;; Check if not already revealed
    (asserts! (not (get revealed commitment-record)) ERR-ALREADY-REVEALED)

    ;; Verify commitment matches
    (asserts! (is-eq expected-commitment (get commitment commitment-record)) ERR-INVALID-REVEAL)

    ;; Update commitment record
    (map-set commitments
      { session-id: session-id, voter: caller }
      (merge commitment-record { revealed: true })
    )

    ;; Record revealed vote
    (map-set revealed-votes
      { session-id: session-id, voter: caller }
      {
        outcome: outcome,
        vote-power: (get vote-power commitment-record)
      }
    )

    ;; Update vote tally
    (let
      (
        (vote-power (get vote-power commitment-record))
        (new-votes-for-0 (if (is-eq outcome u0)
                            (+ (get total-votes-for-0 session) vote-power)
                            (get total-votes-for-0 session)
                          ))
        (new-votes-for-1 (if (is-eq outcome u1)
                            (+ (get total-votes-for-1 session) vote-power)
                            (get total-votes-for-1 session)
                          ))
      )
      (map-set voting-sessions
        session-id
        (merge session
          {
            total-votes-for-0: new-votes-for-0,
            total-votes-for-1: new-votes-for-1
          }
        )
      )
    )

    (print
      {
        event: "vote-revealed",
        session-id: session-id,
        voter: caller,
        outcome: outcome,
        vote-power: (get vote-power commitment-record)
      }
    )

    (ok true)
  )
)

;; Slash non-revealers (can be called after reveal phase ends)
;; Voters who didn't reveal lose 10% of staked tokens
(define-public (slash-non-revealers (session-id uint) (token <sip-010-trait>))
  (let
    (
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (current-height block-height)
    )
    ;; Check if reveal phase has ended
    (asserts! (>= current-height (get reveal-end session)) ERR-NOT-IN-REVEAL-PHASE)

    ;; Check if not already tallied
    (asserts! (not (get is-tallied session)) ERR-VOTE-ALREADY-TALLIED)

    ;; Note: In production, this would iterate through commitments and slash non-revealers
    ;; For now, we emit an event that the frontend can use to trigger slashing
    ;; The actual slashing would be done by a batch process

    (print
      {
        event: "slash-triggered",
        session-id: session-id,
        slash-percentage: SLASH-PERCENTAGE,
        note: "Non-revealers will be slashed 10%"
      }
    )

    (ok true)
  )
)

;; Tally votes (can be called after voting ends)
;; Determines winning outcome and triggers reputation updates
(define-public (tally-votes (session-id uint) (token <sip-010-trait>))
  (let
    (
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (current-height block-height)
      (votes-for-0 (get total-votes-for-0 session))
      (votes-for-1 (get total-votes-for-1 session))
    )
    ;; Check if voting has ended
    (asserts! (>= current-height (get end-block session)) ERR-SESSION-NOT-ENDED)

    ;; Check if not already tallied
    (asserts! (not (get is-tallied session)) ERR-VOTE-ALREADY-TALLIED)

    ;; Determine winning outcome
    (let
      (
        (winning-outcome (if (> votes-for-0 votes-for-1)
                            u0
                            u1
                          ))
      )
      ;; Update session with tally results
      (map-set voting-sessions
        session-id
        (merge session
          {
            is-tallied: true,
            winning-outcome: (some winning-outcome)
          }
        )
      )

      ;; Update reputation for voters
      ;; This is done by iterating through revealed votes
      ;; For now, we emit an event and the frontend can trigger reputation updates
      ;; In production, this would be a batch process

      (print
        {
          event: "votes-tallied",
          session-id: session-id,
          votes-for-0: votes-for-0,
          votes-for-1: votes-for-1,
          winning-outcome: winning-outcome,
          total-staked: (get total-staked session)
        }
      )

      (ok winning-outcome)
    )
  )
)

;; Update reputation for a voter after tally
;; Called by the tally process or admin to update voter reputation
(define-public (update-voter-reputation
    (session-id uint)
    (voter principal)
    (was-correct bool)
    (tokens-earned uint)
  )
  (let
    (
      (caller contract-caller)
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (commitment-record (unwrap! (map-get? commitments { session-id: session-id, voter: voter }) ERR-NO-COMMITMENT-FOUND))
    )
    ;; Only authorized contracts can call this (tally process or owner)
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Check if session has been tallied
    (asserts! (get is-tallied session) ERR-VOTE-ALREADY-TALLIED)

    ;; Update reputation in reputation-registry
    (try! (contract-call? .reputation-registry update-reputation voter was-correct tokens-earned))

    (print
      {
        event: "reputation-updated",
        session-id: session-id,
        voter: voter,
        was-correct: was-correct,
        tokens-earned: tokens-earned
      }
    )

    (ok true)
  )
)

;; Distribute rewards to voters
;; Called after tally to distribute slashed tokens and rewards
(define-public (distribute-rewards
    (session-id uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller contract-caller)
      (session (unwrap! (map-get? voting-sessions session-id) ERR-NO-VOTE-SESSION))
      (winning-outcome (unwrap! (get winning-outcome session) ERR-VOTE-ALREADY-TALLIED))
      (total-rewards (get total-staked session))
    )
    ;; Only contract owner can distribute (in production, this would be governed)
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check if session has been tallied
    (asserts! (get is-tallied session) ERR-VOTE-ALREADY-TALLIED)

    ;; Note: In production, this would:
    ;; 1. Calculate rewards from slashed tokens (10% of non-revealers)
    ;; 2. Distribute proportionally to winning voters
    ;; 3. Return stakes to all voters
    ;; For now, we emit an event

    (print
      {
        event: "rewards-distribution-triggered",
        session-id: session-id,
        winning-outcome: winning-outcome,
        total-rewards: total-rewards,
        note: "Rewards distribution would be handled by a batch process"
      }
    )

    (ok true)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Reset voting session (owner only, for testing/correction)
(define-public (reset-voting-session (session-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-delete voting-sessions session-id)

    (print
      {
        event: "voting-session-reset",
        session-id: session-id
      }
    )

    (ok true)
  )
)
