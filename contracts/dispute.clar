;; Dispute Contract for StackPredict Protocol
;; Allows anyone to challenge market resolutions by staking $PRED
;; Integrates with governance for voting on disputed markets

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant DISPUTE-WINDOW u1008) ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant MINIMUM-DISPUTE-STAKE u100000000) ;; 1 PRED (8 decimals)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1100))
(define-constant ERR-ZERO-AMOUNT (err u1101))
(define-constant ERR-INSUFFICIENT-BALANCE (err u1102))
(define-constant ERR-MARKET-NOT-RESOLVED (err u1103))
(define-constant ERR-DISPUTE-ALREADY-OPENED (err u1104))
(define-constant ERR-DISPUTE-NOT-OPENED (err u1105))
(define-constant ERR-DISPUTE-WINDOW-NOT-ENDED (err u1106))
(define-constant ERR-DISPUTE-WINDOW-ENDED (err u1107))
(define-constant ERR-ALREADY-DISPUTED (err u1108))
(define-constant ERR-INVALID-MARKET (err u1109))
(define-constant ERR-NO-DISPUTE-FOUND (err u1110))
(define-constant ERR-DISPUTE-ALREADY-RESOLVED (err u1111))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Dispute structure
;; - market-id: ID of the disputed market
;; - disputer: Principal who opened the dispute
;; - claimed-outcome: The outcome the disputer claims is correct (0 = YES, 1 = NO)
;; - stake-amount: Amount of $PRED staked
;; - opened-at: Block height when dispute was opened
;; - dispute-deadline: When the 7-day voting period ends
;; - resolved: Whether the dispute has been resolved
;; - dispute-winner: Who won the dispute (0 = disputer, 1 = original creator, none = pending)
;; - votes-for-disputer: Total voting power voting for disputer's claim
;; - votes-for-creator: Total voting power voting for original resolution
(define-map disputes
  uint
  {
    market-id: uint,
    disputer: principal,
    claimed-outcome: uint,
    stake-amount: uint,
    opened-at: uint,
    dispute-deadline: uint,
    resolved: bool,
    dispute-winner: (optional uint), ;; 0 = disputer wins, 1 = creator wins
    votes-for-disputer: uint,
    votes-for-creator: uint
  }
)

;; Track disputes by market ID (one dispute per market at a time)
(define-map market-dispute
  uint
  uint ;; dispute-id
)

;; Track disputes by disputer
(define-map disputer-disputes
  principal
  (list 50 uint) ;; list of dispute IDs
)

;; Track if a user has voted on a dispute
(define-map dispute-votes
  { dispute-id: uint, voter: principal }
  {
    vote-type: uint, ;; 0 = for creator (original resolution), 1 = for disputer (claimed outcome)
    voting-power: uint
  }
)

;; Sequential dispute ID counter
(define-data-var dispute-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get dispute details by ID
(define-read-only (get-dispute (dispute-id uint))
  (ok (map-get? disputes dispute-id))
)

;; Get dispute ID for a market
(define-read-only (get-market-dispute (market-id uint))
  (ok (map-get? market-dispute market-id))
)

;; Get all disputes for a disputer
(define-read-only (get-disputer-disputes (disputer principal))
  (ok (default-to (list) (map-get? disputer-disputes disputer)))
)

;; Check if a market has an active dispute
(define-read-only (has-active-dispute (market-id uint))
  (match (map-get? market-dispute market-id)
    dispute-id
    (let
      (
        (dispute (map-get? disputes dispute-id))
      )
      (match dispute
        d
        (ok (and (not (get resolved d)) (< block-height (get dispute-deadline d))))
        (ok false)
      )
    )
    (ok false)
  )
)

;; Get dispute status
(define-read-only (get-dispute-status (dispute-id uint))
  (match (map-get? disputes dispute-id)
    dispute
    (some {
      dispute-id: dispute-id,
      market-id: (get market-id dispute),
      disputer: (get disputer dispute),
      claimed-outcome: (get claimed-outcome dispute),
      stake-amount: (get stake-amount dispute),
      opened-at: (get opened-at dispute),
      dispute-deadline: (get dispute-deadline dispute),
      resolved: (get resolved dispute),
      dispute-winner: (get dispute-winner dispute),
      votes-for-disputer: (get votes-for-disputer dispute),
      votes-for-creator: (get votes-for-creator dispute),
      can-vote: (< block-height (get dispute-deadline dispute)),
      can-finalize: (and (>= block-height (get dispute-deadline dispute)) (not (get resolved dispute)))
    })
    none
  )
)

;; Check if a user has voted on a dispute
(define-read-only (has-voted-on-dispute (dispute-id uint) (voter principal))
  (ok (is-some (map-get? dispute-votes { dispute-id: dispute-id, voter: voter })))
)

;; Get user's vote on a dispute
(define-read-only (get-dispute-vote (dispute-id uint) (voter principal))
  (ok (map-get? dispute-votes { dispute-id: dispute-id, voter: voter }))
)

;; Calculate total votes for a dispute
(define-read-only (get-dispute-vote-totals (dispute-id uint))
  (match (map-get? disputes dispute-id)
    dispute
    (ok {
      for-disputer: (get votes-for-disputer dispute),
      for-creator: (get votes-for-creator dispute),
      total: (+ (get votes-for-disputer dispute) (get votes-for-creator dispute))
    })
    (ok { for-disputer: u0, for-creator: u0, total: u0 })
  )
)

;; Get current dispute ID counter
(define-read-only (get-dispute-id-counter)
  (ok (var-get dispute-id-counter))
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Open a dispute on a market resolution
;; Anyone can call this to challenge a market resolution
;; Requires staking $PRED tokens
(define-public (open-dispute
    (market-id uint)
    (claimed-outcome uint)
    (stake-amount uint)
    (token <sip-010-trait>)
  )
  (let
    (
      (caller tx-sender)
      (new-dispute-id (+ (var-get dispute-id-counter) u1))
      (dispute-deadline (+ block-height DISPUTE-WINDOW))
    )
    ;; Validate parameters
    (asserts! (>= stake-amount MINIMUM-DISPUTE-STAKE) ERR-ZERO-AMOUNT)
    (asserts! (or (is-eq claimed-outcome u0) (is-eq claimed-outcome u1)) ERR-INVALID-MARKET)

    ;; Check if market exists and is resolved (via market-pool)
    ;; Note: We check if market-pool has this market resolved
    ;; For now, we'll validate by checking if the market has a resolution
    ;; In production, this would integrate with market-factory to verify market exists

    ;; Check if market already has an active dispute
    (asserts! (is-none (map-get? market-dispute market-id)) ERR-DISPUTE-ALREADY-OPENED)

    ;; Transfer $PRED stake from user to this contract
    (try! (contract-call? token transfer stake-amount caller (as-contract tx-sender) none))

    ;; Create dispute
    (map-set disputes
      new-dispute-id
      {
        market-id: market-id,
        disputer: caller,
        claimed-outcome: claimed-outcome,
        stake-amount: stake-amount,
        opened-at: block-height,
        dispute-deadline: dispute-deadline,
        resolved: false,
        dispute-winner: none,
        votes-for-disputer: u0,
        votes-for-creator: u0
      }
    )

    ;; Link market to dispute
    (map-set market-dispute market-id new-dispute-id)

    ;; Add to disputer's dispute list
    (let
      (
        (disputer-list (default-to (list) (map-get? disputer-disputes caller)))
        (new-list (unwrap-panic (as-max-len? (append disputer-list new-dispute-id) u50)))
      )
      (map-set disputer-disputes caller new-list)
    )

    ;; Update dispute ID counter
    (var-set dispute-id-counter new-dispute-id)

    (print
      {
        event: "dispute-opened",
        dispute-id: new-dispute-id,
        market-id: market-id,
        disputer: caller,
        claimed-outcome: claimed-outcome,
        stake-amount: stake-amount,
        dispute-deadline: dispute-deadline
      }
    )

    (ok new-dispute-id)
  )
)

;; Vote on a dispute
;; Only users with voting power (from vote-escrow) can vote
(define-public (vote-on-dispute (dispute-id uint) (vote-type uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (dispute (unwrap! (map-get? disputes dispute-id) ERR-NO-DISPUTE-FOUND))
      (voting-power-result (contract-call? .vote-escrow get-voting-power caller))
      (voting-power (unwrap! voting-power-result ERR-ZERO-AMOUNT))
      (current-vote (map-get? dispute-votes { dispute-id: dispute-id, voter: caller }))
    )
    ;; Validate vote type (0 = for creator, 1 = for disputer)
    (asserts! (or (is-eq vote-type u0) (is-eq vote-type u1)) ERR-INVALID-MARKET)

    ;; Check if dispute is still active (before deadline)
    (asserts! (< block-height (get dispute-deadline dispute)) ERR-DISPUTE-WINDOW-ENDED)

    ;; Check if already voted
    (asserts! (is-none current-vote) ERR-ALREADY-DISPUTED)

    ;; Check if voter has voting power
    (asserts! (> voting-power u0) ERR-ZERO-AMOUNT)

    ;; Record vote
    (map-set dispute-votes
      { dispute-id: dispute-id, voter: caller }
      { vote-type: vote-type, voting-power: voting-power }
    )

    ;; Update dispute vote counts
    (let
      (
        (new-for-disputer (if (is-eq vote-type u1) (+ (get votes-for-disputer dispute) voting-power) (get votes-for-disputer dispute)))
        (new-for-creator (if (is-eq vote-type u0) (+ (get votes-for-creator dispute) voting-power) (get votes-for-creator dispute)))
      )
      (map-set disputes
        dispute-id
        (merge dispute
          {
            votes-for-disputer: new-for-disputer,
            votes-for-creator: new-for-creator
          }
        )
      )
    )

    (print
      {
        event: "dispute-vote-cast",
        dispute-id: dispute-id,
        voter: caller,
        vote-type: vote-type,
        voting-power: voting-power
      }
    )

    (ok true)
  )
)

;; Finalize dispute resolution
;; Called after dispute window ends to determine winner and distribute stakes
(define-public (finalize-dispute (dispute-id uint) (token <sip-010-trait>))
  (let
    (
      (dispute (unwrap! (map-get? disputes dispute-id) ERR-NO-DISPUTE-FOUND))
      (disputer (get disputer dispute))
      (stake-amount (get stake-amount dispute))
      (votes-disputer (get votes-for-disputer dispute))
      (votes-creator (get votes-for-creator dispute))
    )
    ;; Check if dispute exists and not already resolved
    (asserts! (not (get resolved dispute)) ERR-DISPUTE-ALREADY-RESOLVED)

    ;; Check if dispute window has ended
    (asserts! (>= block-height (get dispute-deadline dispute)) ERR-DISPUTE-WINDOW-NOT-ENDED)

    ;; Determine winner based on votes
    (let
      (
        (disputer-wins (or (> votes-disputer votes-creator) (and (is-eq votes-disputer u0) (is-eq votes-creator u0))))
        (winner (if disputer-wins u0 u1)) ;; 0 = disputer, 1 = creator
      )
      ;; Update dispute resolution
      (map-set disputes
        dispute-id
        (merge dispute
          {
            resolved: true,
            dispute-winner: (some winner)
          }
        )
      )

      ;; Distribute stakes based on winner
      (if disputer-wins
        ;; Disputer wins: disputer gets their stake back + creator's collateral (if any)
        ;; For now, just return the disputer's stake
        ;; In full implementation, would also slash creator's collateral
        (begin
          (try! (as-contract (contract-call? token transfer stake-amount tx-sender disputer none)))
          (print
            {
              event: "dispute-finalized",
              dispute-id: dispute-id,
              winner: "disputer",
              reward-amount: stake-amount,
              votes-for-disputer: votes-disputer,
              votes-for-creator: votes-creator
            }
          )
        )
        ;; Creator wins: disputer's stake is slashed and distributed to protocol treasury
        ;; In full implementation, could distribute to voters or protocol treasury
        (begin
          ;; Transfer stake to contract owner (protocol treasury)
          (try! (as-contract (contract-call? token transfer stake-amount tx-sender CONTRACT-OWNER none)))
          (print
            {
              event: "dispute-finalized",
              dispute-id: dispute-id,
              winner: "creator",
              reward-amount: stake-amount,
              votes-for-disputer: votes-disputer,
              votes-for-creator: votes-creator
            }
          )
        )
      )
    )

    (ok true)
  )
)

;; Cancel dispute (only by disputer, before voting period ends)
;; Allows disputer to withdraw their dispute if they change their mind
;; Stake is returned minus a small penalty
(define-public (cancel-dispute (dispute-id uint) (token <sip-010-trait>))
  (let
    (
      (caller tx-sender)
      (dispute (unwrap! (map-get? disputes dispute-id) ERR-NO-DISPUTE-FOUND))
      (stake-amount (get stake-amount dispute))
      (penalty-amount (/ (* stake-amount u50) u1000)) ;; 5% penalty
      (return-amount (- stake-amount penalty-amount))
    )
    ;; Only disputer can cancel
    (asserts! (is-eq caller (get disputer dispute)) ERR-NOT-AUTHORIZED)

    ;; Check if dispute is not resolved
    (asserts! (not (get resolved dispute)) ERR-DISPUTE-ALREADY-RESOLVED)

    ;; Check if dispute window hasn't ended yet
    (asserts! (< block-height (get dispute-deadline dispute)) ERR-DISPUTE-WINDOW-ENDED)

    ;; Mark as resolved with creator as winner (disputer forfeits)
    (map-set disputes
      dispute-id
      (merge dispute
        {
          resolved: true,
          dispute-winner: (some u1) ;; Creator wins by default
        }
      )
    )

    ;; Return stake minus penalty to disputer
    ;; Penalty goes to contract owner (protocol treasury)
    (try! (as-contract (contract-call? token transfer penalty-amount tx-sender CONTRACT-OWNER none)))
    (try! (as-contract (contract-call? token transfer return-amount tx-sender caller none)))

    (print
      {
        event: "dispute-cancelled",
        dispute-id: dispute-id,
        disputer: caller,
        stake-returned: return-amount,
        penalty: penalty-amount
      }
    )

    (ok true)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Update minimum dispute stake (owner only)
(define-public (update-minimum-dispute-stake (new-amount uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-amount u0) ERR-ZERO-AMOUNT)
    ;; Note: In production, this should be a governance parameter
    ;; For now, just a placeholder
    (print { event: "minimum-stake-updated", new-amount: new-amount })
    (ok true)
  )
)
