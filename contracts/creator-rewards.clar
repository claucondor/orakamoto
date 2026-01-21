;; Creator Rewards Contract for StackPredict Protocol
;; Distributes $PRED governance tokens to market creators based on market success metrics
;; Based on epoch-based market performance tracking

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant EPOCH-DURATION u1008) ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant MIN-MARKET-VOLUME u1000000) ;; Minimum 1 USDC equivalent volume to earn rewards
(define-constant MAX-EPOCHS-BACK u52) ;; Track up to 52 weeks of epochs

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u900))
(define-constant ERR-NOT-TOKEN-OWNER (err u901))
(define-constant ERR-ZERO-AMOUNT (err u902))
(define-constant ERR-INSUFFICIENT-BALANCE (err u903))
(define-constant ERR-ALREADY-CLAIMED (err u904))
(define-constant ERR-NO-REWARDS (err u905))
(define-constant ERR-INVALID-EPOCH (err u906))
(define-constant ERR-EPOCH-NOT-ENDED (err u907))
(define-constant ERR-ALREADY-DISTRIBUTED (err u908))
(define-constant ERR-NO-ELIGIBLE-CREATORS (err u909))

;; Data Variables
(define-data-var total-rewards-distributed uint u0)
(define-data-var current-epoch uint u1)
(define-data-var epoch-start-block uint u0)
(define-data-var total-market-score uint u0) ;; Sum of all market scores for current epoch

;; Data Maps

;; Track market success score per creator per epoch
;; market-score = sum of (trading-volume * participation-multiplier) for each epoch
(define-map creator-market-score
  { epoch: uint, creator: principal }
  uint
)

;; Track total market score per epoch
(define-map epoch-total-score
  { epoch: uint }
  uint
)

;; Track rewards earned per creator per epoch
(define-map creator-rewards
  { epoch: uint, creator: principal }
  uint
)

;; Track if rewards have been claimed
(define-map rewards-claimed
  { epoch: uint, creator: principal }
  bool
)

;; Track epoch distribution status
(define-map epoch-distributed
  { epoch: uint }
  bool
)

;; SIP-010 Token Implementation
(define-fungible-token pred)

;; SIP-010 Transfer
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? pred amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (print {event: "transfer", sender: sender, recipient: recipient, amount: amount})
    (ok true)))

;; SIP-010 Get Name
(define-read-only (get-name)
  (ok "StackPredict Creator Rewards"))

;; SIP-010 Get Symbol
(define-read-only (get-symbol)
  (ok "PRED"))

;; SIP-010 Get Decimals
(define-read-only (get-decimals)
  (ok u8))

;; SIP-010 Get Balance
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance pred who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply pred)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Mint - Restricted to contract owner (for initial distribution)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-mint? pred amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)))

;; Burn - Allows token holders to burn their own tokens
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance pred caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? pred amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)))

;; Initialize Epoch
;; Called when the first market is created
(define-public (initialize-epoch)
  (let
    (
      (current-epoch-start (var-get epoch-start-block))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq current-epoch-start u0) ERR-ALREADY-DISTRIBUTED)

    (var-set epoch-start-block block-height)
    (print {event: "epoch-initialized", start-block: block-height})
    (ok true)))

;; Record Market Success Score
;; Called by market-factory or market-pool when a market's success is calculated
;; market-score = trading-volume * participation-multiplier
;; participation-multiplier = min(2.0, 1.0 + (number-of-trades / 100))
(define-public (record-market-score
    (creator principal)
    (market principal)
    (trading-volume uint)
    (number-of-trades uint)
  )
  (let
    (
      (epoch (var-get current-epoch))
      (epoch-start (var-get epoch-start-block))
      ;; Calculate participation multiplier (1.0 to 2.0)
      ;; 1 trade = 1.01x, 50 trades = 1.5x, 100+ trades = 2.0x
      (participation-multiplier
        (if (>= number-of-trades u100)
          u2000000  ;; 2.0 * PRECISION
          (+ u1000000 (/ (* number-of-trades u1000000) u100))  ;; 1.0 + (trades/100) - multiply first to avoid integer division truncation
        )
      )
      ;; Calculate market score: volume * multiplier / PRECISION
      (market-score (/ (* trading-volume participation-multiplier) PRECISION))
      (existing-score (default-to u0 (map-get? creator-market-score { epoch: epoch, creator: creator })))
      (total-score (default-to u0 (map-get? epoch-total-score { epoch: epoch })))
    )
    (asserts! (or (is-eq contract-caller CONTRACT-OWNER) (is-eq contract-caller .market-factory) (is-eq contract-caller .market-pool)) ERR-NOT-AUTHORIZED)
    (asserts! (> trading-volume u0) ERR-ZERO-AMOUNT)

    ;; Update creator score
    (map-set creator-market-score
      { epoch: epoch, creator: creator }
      (+ existing-score market-score)
    )

    ;; Update total score
    (map-set epoch-total-score
      { epoch: epoch }
      (+ total-score market-score)
    )

    (var-set total-market-score (+ (var-get total-market-score) market-score))

    (print
      {
        event: "market-score-recorded",
        creator: creator,
        market: market,
        trading-volume: trading-volume,
        number-of-trades: number-of-trades,
        participation-multiplier: participation-multiplier,
        market-score: market-score,
        epoch: epoch
      }
    )
    (ok true)))

;; Distribute Rewards for Epoch
;; Called at the end of an epoch to distribute $PRED rewards to creators
;; Rewards are proportional to market success scores
(define-public (distribute-rewards
    (epoch uint)
    (reward-amount uint)
  )
  (let
    (
      (total-score (default-to u0 (map-get? epoch-total-score { epoch: epoch })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
      (epoch-end (+ (var-get epoch-start-block) (* (- epoch u1) EPOCH-DURATION) EPOCH-DURATION))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> reward-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (> total-score u0) ERR-NO-ELIGIBLE-CREATORS)
    (asserts! (not is-distributed) ERR-ALREADY-DISTRIBUTED)
    (asserts! (>= block-height epoch-end) ERR-EPOCH-NOT-ENDED)

    ;; Transfer rewards to this contract first
    (try! (contract-call? .governance-token transfer reward-amount CONTRACT-OWNER (as-contract tx-sender) none))

    ;; Calculate and distribute rewards to each creator
    (let
      (
        (creator-list (get-creators-for-epoch epoch))
        (distributed (fold distribute-to-creator creator-list { epoch: epoch, total-score: total-score, remaining: reward-amount }))
      )
      (asserts! (> (get remaining distributed) u0) ERR-NO-ELIGIBLE-CREATORS)

      ;; Mark epoch as distributed
      (map-set epoch-distributed { epoch: epoch } true)

      (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) reward-amount))

      (print
        {
          event: "rewards-distributed",
          epoch: epoch,
          reward-amount: reward-amount,
          total-score: total-score,
          creators-count: (len creator-list)
        }
      )
      (ok true)
    )
  )
)

;; Helper function to distribute rewards to a single creator
(define-private (distribute-to-creator
    (creator principal)
    (state { epoch: uint, total-score: uint, remaining: uint })
  )
  (let
    (
      (epoch (get epoch state))
      (total-score (get total-score state))
      (remaining (get remaining state))
      (creator-score (default-to u0 (map-get? creator-market-score { epoch: epoch, creator: creator })))
      ;; Calculate reward share (proportional to score)
      (reward-share (/ (* creator-score remaining) total-score))
    )
    ;; Only distribute if creator has score and reward is meaningful
    (if (and (> creator-score u0) (> reward-share u0))
      (begin
        ;; Store reward for creator to claim later
        (map-set creator-rewards { epoch: epoch, creator: creator } reward-share)
        {
          epoch: epoch,
          total-score: total-score,
          remaining: (- remaining reward-share)
        }
      )
      state
    )
  )
)

;; Claim Rewards
;; Allows creators to claim their earned rewards for a specific epoch
(define-public (claim-rewards (epoch uint))
  (let
    (
      (caller tx-sender)
      (reward (default-to u0 (map-get? creator-rewards { epoch: epoch, creator: caller })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, creator: caller })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (asserts! (> reward u0) ERR-NO-REWARDS)
    (asserts! (not is-claimed) ERR-ALREADY-CLAIMED)
    (asserts! is-distributed ERR-ALREADY-DISTRIBUTED)

    ;; Mark as claimed
    (map-set rewards-claimed { epoch: epoch, creator: caller } true)

    ;; Transfer rewards to creator
    (try! (as-contract (contract-call? .governance-token transfer reward tx-sender caller none)))

    (print
      {
        event: "rewards-claimed",
        epoch: epoch,
        creator: caller,
        amount: reward
      }
    )
    (ok reward)
  )
)

;; Claim All Rewards
;; Allows creators to claim all their earned rewards for specific epochs
;; Note: Due to Clarity limitations, caller must pass explicit epoch list
;; Example: (claim-all-rewards (list u1 u2 u3)) for epochs 1, 2, 3
(define-public (claim-all-rewards (epochs (list 20 uint)))
  (let
    (
      (caller tx-sender)
      (initial-state { creator: caller, total: u0 })
      (final-state (fold claim-rewards-for-epoch epochs initial-state))
      (claimable (get total final-state))
    )
    (asserts! (> claimable u0) ERR-NO-REWARDS)
    (ok claimable)
  )
)

;; Helper to claim rewards for a single epoch
;; Returns updated state tuple (required by fold)
(define-private (claim-rewards-for-epoch (epoch uint) (state { creator: principal, total: uint }))
  (let
    (
      (creator (get creator state))
      (total (get total state))
      (reward (default-to u0 (map-get? creator-rewards { epoch: epoch, creator: creator })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, creator: creator })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      (match (as-contract (contract-call? .governance-token transfer reward tx-sender creator none))
        success (begin
          (map-set rewards-claimed { epoch: epoch, creator: creator } true)
          { creator: creator, total: (+ total reward) }
        )
        error state  ;; If transfer fails, return unchanged state
      )
      state  ;; No reward to claim, return unchanged state
    )
  )
)

;; Read-Only Functions

;; Get creator's market score for an epoch
(define-read-only (get-creator-score (epoch uint) (creator principal))
  (ok (default-to u0 (map-get? creator-market-score { epoch: epoch, creator: creator }))))

;; Get total market score for an epoch
(define-read-only (get-epoch-total-score (epoch uint))
  (ok (default-to u0 (map-get? epoch-total-score { epoch: epoch }))))

;; Get creator's earned rewards for an epoch
(define-read-only (get-creator-rewards (epoch uint) (creator principal))
  (ok (default-to u0 (map-get? creator-rewards { epoch: epoch, creator: creator }))))

;; Check if rewards have been claimed
(define-read-only (is-rewards-claimed (epoch uint) (creator principal))
  (ok (default-to false (map-get? rewards-claimed { epoch: epoch, creator: creator }))))

;; Check if epoch has been distributed
(define-read-only (is-epoch-distributed (epoch uint))
  (ok (default-to false (map-get? epoch-distributed { epoch: epoch }))))

;; Get current epoch
(define-read-only (get-current-epoch)
  (ok (var-get current-epoch)))

;; Get epoch start block
(define-read-only (get-epoch-start-block)
  (ok (var-get epoch-start-block)))

;; Get total rewards distributed
(define-read-only (get-total-rewards-distributed)
  (ok (var-get total-rewards-distributed)))

;; Get total market score across all epochs
(define-read-only (get-total-market-score)
  (ok (var-get total-market-score)))

;; Get pending rewards for a creator for specific epochs
;; Note: Caller must pass explicit epoch list due to Clarity limitations
;; Example: (get-pending-rewards creator (list u1 u2 u3)) for epochs 1, 2, 3
(define-read-only (get-pending-rewards (creator principal) (epochs (list 20 uint)))
  (let
    (
      (initial-state { creator: creator, total: u0 })
      (final-state (fold get-pending-for-epoch epochs initial-state))
    )
    (ok (get total final-state))
  )
)

;; Helper to get pending rewards for a single epoch
;; Returns updated state tuple with accumulated total
(define-private (get-pending-for-epoch (epoch uint) (state { creator: principal, total: uint }))
  (let
    (
      (creator (get creator state))
      (total (get total state))
      (reward (default-to u0 (map-get? creator-rewards { epoch: epoch, creator: creator })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, creator: creator })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      { creator: creator, total: (+ total reward) }
      state
    )
  )
)

;; Helper: always returns false (used to create typed empty list)
(define-private (always-false (p principal)) false)

;; Helper function to get creators for an epoch
;; This is a simplified version - in production, you'd need a way to track all creators per epoch
;; TODO: Implement creator registry to track all creators per epoch
(define-private (get-creators-for-epoch (epoch uint))
  ;; Returns typed empty list - filter removes the dummy element
  ;; In production, replace with actual creator registry lookup
  (filter always-false (list CONTRACT-OWNER)))

;; Advance Epoch
;; Called to move to the next epoch (typically called by governance or at epoch end)
(define-public (advance-epoch)
  (let
    (
      (curr-epoch (var-get current-epoch))
      (epoch-start (var-get epoch-start-block))
      (epoch-end (+ epoch-start (* curr-epoch EPOCH-DURATION)))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (>= block-height epoch-end) ERR-EPOCH-NOT-ENDED)

    (var-set current-epoch (+ curr-epoch u1))

    (print
      {
        event: "epoch-advanced",
        new-epoch: (+ curr-epoch u1),
        start-block: block-height
      }
    )
    (ok true)
  )
)
