;; Reputation Registry Contract for StackPredict Protocol
;; Implements Layer 4: Quadratic Reputation Voting
;; Tracks voter reputation based on historical accuracy and participation
;;
;; Reputation Formula:
;; reputation_score = (correct_votes / total_votes) * participation_rate * PRECISION
;; vote_power = sqrt(tokens_staked) * reputation_score * time_multiplier
;;
;; Decay: 1% reputation decay per month of inactivity (432 blocks)

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)           ;; For precise calculations (1.0 = 1000000)
(define-constant DECAY-PER-MONTH u10000)       ;; 1% decay per month (10000 = 1%)
(define-constant MONTH-IN-BLOCKS u43200)       ;; ~30 days in blocks (144 blocks/day * 30)
(define-constant MAX-REPUTATION u1000000)      ;; Maximum reputation score (1.0)
(define-constant MIN-REPUTATION u100000)       ;; Minimum reputation score (0.1)
(define-constant TIME-MULTIPLIER-MAX u4000000) ;; Maximum time multiplier (4.0x)
(define-constant TIME-MULTIPLIER-BASE u1000000) ;; Base time multiplier (1.0x)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1300))
(define-constant ERR-ZERO-AMOUNT (err u1301))
(define-constant ERR-INVALID-PARTICIPATION (err u1302))
(define-constant ERR-NO-REPUTATION-FOUND (err u1303))
(define-constant ERR-ALREADY-VOTED (err u1304))
(define-constant ERR-REPUTATION-CALCULATION-FAILED (err u1305))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Reputation record for each voter
;; - correct-votes: Number of votes that were correct (matched final outcome)
;; - total-votes: Total number of votes cast
;; - participation-score: Participation rate (0-1000000 = 0-100%)
;; - last-updated: Block height when reputation was last updated
;; - total-earned: Total $PRED tokens earned (for tracking)
(define-map reputation
  principal
  {
    correct-votes: uint,
    total-votes: uint,
    participation-score: uint,
    last-updated: uint,
    total-earned: uint
  }
)

;; Reputation history for transparency/auditing
;; Tracks each reputation update event
;; - voter: Principal being updated
;; - block-height: When the update occurred
;; - correct-votes: Correct votes after update
;; - total-votes: Total votes after update
;; - participation-score: Participation rate after update
;; - reputation-score: Final reputation score after update
;; - action: Type of action ("initial", "vote-cast", "vote-resolved", "decay")
(define-map reputation-history
  uint
  {
    voter: principal,
    block-height: uint,
    correct-votes: uint,
    total-votes: uint,
    participation-score: uint,
    reputation-score: uint,
    action: (string-ascii 20)
  }
)

;; Track votes cast by each voter (for preventing double voting on same market)
;; - voter -> list of market-ids they've voted on
(define-map voter-votes
  principal
  (list 100 uint)
)

;; Sequential history ID counter
(define-data-var history-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get reputation record for a voter
(define-read-only (get-reputation (voter principal))
  (ok (map-get? reputation voter))
)

;; Get current reputation score (0-1000000)
;; Formula: (correct_votes / total_votes) * participation_rate * PRECISION
;; Returns: (ok uint) or ERR-REPUTATION-CALCULATION-FAILED
(define-read-only (get-reputation-score (voter principal))
  (let
    (
      (rep (map-get? reputation voter))
    )
    (match rep
      rep-data
      (let
        (
          (correct (get correct-votes rep-data))
          (total (get total-votes rep-data))
          (participation (get participation-score rep-data))
        )
        ;; Calculate reputation score
        (if (> total u0)
          (let
            (
              ;; accuracy = correct_votes / total_votes (scaled by PRECISION)
              (accuracy (/ (* correct PRECISION) total))
              ;; reputation = accuracy * participation
              (reputation-score (/ (* accuracy participation) PRECISION))
            )
            (ok reputation-score)
          )
          ;; No votes yet, return minimum reputation
          (ok MIN-REPUTATION)
        )
      )
      ;; No reputation found, return minimum
      (ok MIN-REPUTATION)
    )
  )
)

;; Calculate vote power using quadratic formula
;; Formula: vote_power = sqrt(tokens_staked) * reputation_score * time_multiplier
(define-read-only (calculate-vote-power
    (voter principal)
    (tokens-staked uint)
    (stake-duration uint)
  )
  (let
    (
      ;; Get reputation score (always returns ok for valid voters)
      (reputation-score (unwrap-panic (get-reputation-score voter)))
      ;; Calculate time multiplier: 1.0 + (stake_duration / 365 days)
      ;; Max multiplier: 4.0x (for 3 years)
      (time-multiplier
        (let
          (
            (duration-in-months (/ stake-duration u43200)) ;; Convert blocks to months
            (multiplier (+ TIME-MULTIPLIER-BASE (/ (* duration-in-months TIME-MULTIPLIER-BASE) u12)))
          )
          ;; Cap at 4.0x
          (if (> multiplier TIME-MULTIPLIER-MAX)
            TIME-MULTIPLIER-MAX
            multiplier
          )
        )
      )
      ;; Calculate sqrt(tokens_staked) using integer approximation
      ;; Babylonian method for integer square root
      (sqrt-tokens (sqrt-approx tokens-staked))
    )
    ;; vote_power = sqrt(tokens) * reputation * time_multiplier / PRECISION
    (ok (/ (* (* sqrt-tokens reputation-score) time-multiplier) PRECISION))
  )
)

;; Get participation rate for a voter
(define-read-only (get-participation-rate (voter principal))
  (match (map-get? reputation voter)
    rep
    (ok (get participation-score rep))
    (ok u0)
  )
)

;; Get total votes cast by a voter
(define-read-only (get-total-votes (voter principal))
  (match (map-get? reputation voter)
    rep
    (ok (get total-votes rep))
    (ok u0)
  )
)

;; Get correct votes by a voter
(define-read-only (get-correct-votes (voter principal))
  (match (map-get? reputation voter)
    rep
    (ok (get correct-votes rep))
    (ok u0)
  )
)

;; Get total $PRED earned by a voter
(define-read-only (get-total-earned (voter principal))
  (match (map-get? reputation voter)
    rep
    (ok (get total-earned rep))
    (ok u0)
  )
)

;; Check if a voter has already voted on a specific market
(define-read-only (has-voted-on-market (voter principal) (market-id uint))
  (match (map-get? voter-votes voter)
    votes
    (ok (not (is-none (index-of votes market-id))))
    (ok false)
  )
)

;; Get reputation history by ID
(define-read-only (get-reputation-history (history-id uint))
  (ok (map-get? reputation-history history-id))
)

;; Get total history count
(define-read-only (get-history-count)
  (ok (var-get history-id-counter))
)

;; Calculate decayed reputation based on time since last update
(define-read-only (get-decayed-reputation (voter principal))
  (match (map-get? reputation voter)
    rep
    (let
      (
        (last-updated (get last-updated rep))
        (current-reputation (unwrap-panic (get-reputation-score voter)))
        (blocks-elapsed (- block-height last-updated))
        (months-elapsed (/ blocks-elapsed MONTH-IN-BLOCKS))
      )
      ;; Apply decay: 1% per month
      (if (> months-elapsed u0)
        (let
          (
            ;; decay-factor = (1 - 0.01)^months ~ 1 - (0.01 * months) for small values
            ;; Using: decay = (10000 - (10000 * months)) / 10000
            (decay-amount (* DECAY-PER-MONTH months-elapsed))
            (decay-factor (if (> decay-amount PRECISION)
                            u0
                            (- PRECISION decay-amount)
                          ))
          )
          (ok (/ (* current-reputation decay-factor) PRECISION))
        )
        (ok current-reputation)
      )
    )
    (ok MIN-REPUTATION)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Record a vote cast by a voter
;; Called by quadratic-voting contract when someone casts a vote
(define-public (record-vote-cast
    (voter principal)
    (market-id uint)
    (tokens-staked uint)
  )
  (let
    (
      (caller contract-caller)
      (current-rep (map-get? reputation voter))
      (voted-list (default-to (list) (map-get? voter-votes voter)))
    )
    ;; Only authorized contracts can call this
    ;; (quadratic-voting, or contract owner for testing)
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Check if voter already voted on this market
    (asserts! (is-none (index-of voted-list market-id)) ERR-ALREADY-VOTED)

    ;; Update voter-votes map
    (let
      (
        (new-list (unwrap-panic (as-max-len? (append voted-list market-id) u100)))
      )
      (map-set voter-votes voter new-list)
    )

    ;; Update reputation (increment total votes)
    (match current-rep
      rep
      ;; Existing voter
      (let
        (
          (new-total (+ (get total-votes rep) u1))
          (new-participation (/ (* new-total PRECISION) u100)) ;; Simplified: 1% per vote, capped at 100 votes
          (capped-participation (if (> new-participation PRECISION) PRECISION new-participation))
        )
        (map-set reputation
          voter
          (merge rep
            {
              total-votes: new-total,
              participation-score: capped-participation,
              last-updated: block-height
            }
          )
        )
      )
      ;; New voter
      (map-set reputation
        voter
        {
          correct-votes: u0,
          total-votes: u1,
          participation-score: u10000, ;; 1% participation for first vote
          last-updated: block-height,
          total-earned: u0
        }
      )
    )

    ;; Record history
    (record-history voter "vote-cast")

    (ok true)
  )
)

;; Update reputation after a vote is resolved
;; Called by quadratic-voting contract when market resolution is finalized
(define-public (update-reputation
    (voter principal)
    (was-correct bool)
    (tokens-earned uint)
  )
  (let
    (
      (caller contract-caller)
      (current-rep (unwrap! (map-get? reputation voter) ERR-NO-REPUTATION-FOUND))
    )
    ;; Only authorized contracts can call this
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Update reputation record
    (let
      (
        (new-correct (if was-correct
                        (+ (get correct-votes current-rep) u1)
                        (get correct-votes current-rep)
                      ))
        (new-earned (+ (get total-earned current-rep) tokens-earned))
      )
      (map-set reputation
        voter
        (merge current-rep
          {
            correct-votes: new-correct,
            last-updated: block-height,
            total-earned: new-earned
          }
        )
      )
    )

    ;; Record history
    (record-history voter "vote-resolved")

    (ok true)
  )
)

;; Apply reputation decay for inactivity
;; Anyone can call this to update a voter's reputation based on time elapsed
(define-public (apply-decay (voter principal))
  (let
    (
      (current-rep (unwrap! (map-get? reputation voter) ERR-NO-REPUTATION-FOUND))
      (last-updated (get last-updated current-rep))
      (blocks-elapsed (- block-height last-updated))
      (months-elapsed (/ blocks-elapsed MONTH-IN-BLOCKS))
    )
    ;; Only apply decay if at least 1 month has passed
    (asserts! (> months-elapsed u0) (ok false))

    ;; Apply decay to participation score (reputation score is calculated dynamically)
    ;; Decay participation by 1% per month
    (let
      (
        (current-participation (get participation-score current-rep))
        (decay-amount (* DECAY-PER-MONTH months-elapsed))
        (new-participation (if (> decay-amount current-participation)
                             u0
                             (- current-participation decay-amount)
                           ))
      )
      (map-set reputation
        voter
        (merge current-rep
          {
            participation-score: new-participation,
            last-updated: block-height
          }
        )
      )
    )

    ;; Record history
    (record-history voter "decay")

    (ok true)
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

;; Integer square root approximation using Babylonian method
;; sqrt-approx(n) ~ sqrtn
(define-private (sqrt-approx (n uint))
  (begin
    (if (<= n u1)
      n
      (let
        (
          ;; Initial guess: n / 2
          (x0 (/ n u2))
          ;; Babylonian iteration: x_{k+1} = (x_k + n/x_k) / 2
          (x1 (/ (+ x0 (/ n x0)) u2))
          (x2 (/ (+ x1 (/ n x1)) u2))
          (x3 (/ (+ x2 (/ n x2)) u2))
        )
        x3
      )
    )
  )
)

;; Record reputation history for transparency
(define-private (record-history (voter principal) (action (string-ascii 20)))
  (let
    (
      (rep (unwrap-panic (map-get? reputation voter)))
      (history-id (+ (var-get history-id-counter) u1))
      (reputation-score (unwrap-panic (get-reputation-score voter)))
    )
    (map-set reputation-history
      history-id
      {
        voter: voter,
        block-height: block-height,
        correct-votes: (get correct-votes rep),
        total-votes: (get total-votes rep),
        participation-score: (get participation-score rep),
        reputation-score: reputation-score,
        action: action
      }
    )
    (var-set history-id-counter history-id)
    (ok history-id)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Initialize reputation for a voter (owner only, for testing/migration)
(define-public (initialize-reputation
    (voter principal)
    (correct-votes uint)
    (total-votes uint)
    (participation-score uint)
  )
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= participation-score PRECISION) ERR-INVALID-PARTICIPATION)

    (map-set reputation
      voter
      {
        correct-votes: correct-votes,
        total-votes: total-votes,
        participation-score: participation-score,
        last-updated: block-height,
        total-earned: u0
      }
    )

    (record-history voter "initial")

    (ok true)
  )
)

;; Reset reputation for a voter (owner only, for testing/correction)
(define-public (reset-reputation (voter principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-delete reputation voter)
    (map-delete voter-votes voter)

    (print
      {
        event: "reputation-reset",
        voter: voter
      }
    )

    (ok true)
  )
)

;; Get history ID counter
(define-read-only (get-history-id-counter)
  (ok (var-get history-id-counter))
)
