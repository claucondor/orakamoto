;; Trader Rewards Contract for StackPredict Protocol
;; Distributes $PRED governance tokens to traders based on trading volume
;; Based on epoch-based trading volume tracking

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant EPOCH-DURATION u1008) ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant MIN-REWARD-THRESHOLD u1000000) ;; Minimum 1 USDC equivalent volume to earn rewards
(define-constant MAX-EPOCHS-BACK u52) ;; Track up to 52 weeks of epochs

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u800))
(define-constant ERR-NOT-TOKEN-OWNER (err u801))
(define-constant ERR-ZERO-AMOUNT (err u802))
(define-constant ERR-INSUFFICIENT-BALANCE (err u803))
(define-constant ERR-ALREADY-CLAIMED (err u804))
(define-constant ERR-NO-REWARDS (err u805))
(define-constant ERR-INVALID-EPOCH (err u806))
(define-constant ERR-EPOCH-NOT-ENDED (err u807))
(define-constant ERR-ALREADY-DISTRIBUTED (err u808))
(define-constant ERR-NO-ELIGIBLE-TRADERS (err u809))

;; Data Variables
(define-data-var total-rewards-distributed uint u0)
(define-data-var current-epoch uint u1)
(define-data-var epoch-start-block uint u0)
(define-data-var total-trading-volume uint u0) ;; Sum of all trading volume for current epoch

;; Data Maps

;; Track trader trading volume per epoch
;; trading-volume = sum of (trade_amount) for each epoch
(define-map trader-volume
  { epoch: uint, trader: principal }
  uint
)

;; Track total trading volume per epoch
(define-map epoch-total-volume
  { epoch: uint }
  uint
)

;; Track rewards earned per trader per epoch
(define-map trader-rewards
  { epoch: uint, trader: principal }
  uint
)

;; Track if rewards have been claimed
(define-map rewards-claimed
  { epoch: uint, trader: principal }
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
  (ok "StackPredict Trader Rewards"))

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
;; Called when the first trade is made
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

;; Record Trade Volume
;; Called by market-pool when a trade occurs
;; Calculates and stores trading volume for the trader
(define-public (record-trade-volume
    (trader principal)
    (trade-amount uint)
  )
  (let
    (
      (epoch (var-get current-epoch))
      (epoch-start (var-get epoch-start-block))
      (existing-volume (default-to u0 (map-get? trader-volume { epoch: epoch, trader: trader })))
      (total-volume (default-to u0 (map-get? epoch-total-volume { epoch: epoch })))
    )
    (asserts! (or (is-eq contract-caller CONTRACT-OWNER) (is-eq contract-caller .market-pool)) ERR-NOT-AUTHORIZED)
    (asserts! (> trade-amount u0) ERR-ZERO-AMOUNT)

    ;; Update trader volume
    (map-set trader-volume
      { epoch: epoch, trader: trader }
      (+ existing-volume trade-amount)
    )

    ;; Update total volume
    (map-set epoch-total-volume
      { epoch: epoch }
      (+ total-volume trade-amount)
    )

    (var-set total-trading-volume (+ (var-get total-trading-volume) trade-amount))

    (print
      {
        event: "trade-recorded",
        trader: trader,
        trade-amount: trade-amount,
        epoch: epoch
      }
    )
    (ok true)))

;; Distribute Rewards for Epoch
;; Called at the end of an epoch to distribute $PRED rewards to traders
;; Rewards are proportional to trading volume
(define-public (distribute-rewards
    (epoch uint)
    (reward-amount uint)
  )
  (let
    (
      (total-volume (default-to u0 (map-get? epoch-total-volume { epoch: epoch })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
      (epoch-end (+ (var-get epoch-start-block) (* (- epoch u1) EPOCH-DURATION) EPOCH-DURATION))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> reward-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (> total-volume u0) ERR-NO-ELIGIBLE-TRADERS)
    (asserts! (not is-distributed) ERR-ALREADY-DISTRIBUTED)
    (asserts! (>= block-height epoch-end) ERR-EPOCH-NOT-ENDED)

    ;; Transfer rewards to this contract first
    (try! (contract-call? .governance-token transfer reward-amount CONTRACT-OWNER (as-contract tx-sender) none))

    ;; Calculate and distribute rewards to each trader
    (let
      (
        (trader-list (get-traders-for-epoch epoch))
        (distributed (fold distribute-to-trader trader-list { epoch: epoch, total-volume: total-volume, remaining: reward-amount }))
      )
      (asserts! (> (get remaining distributed) u0) ERR-NO-ELIGIBLE-TRADERS)

      ;; Mark epoch as distributed
      (map-set epoch-distributed { epoch: epoch } true)

      (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) reward-amount))

      (print
        {
          event: "rewards-distributed",
          epoch: epoch,
          reward-amount: reward-amount,
          total-volume: total-volume,
          traders-count: (len trader-list)
        }
      )
      (ok true)
    )
  )
)

;; Helper function to distribute rewards to a single trader
(define-private (distribute-to-trader
    (trader principal)
    (state { epoch: uint, total-volume: uint, remaining: uint })
  )
  (let
    (
      (epoch (get epoch state))
      (total-volume (get total-volume state))
      (remaining (get remaining state))
      (trader-vol (default-to u0 (map-get? trader-volume { epoch: epoch, trader: trader })))
      ;; Calculate reward share (proportional to volume)
      (reward-share (/ (* trader-vol remaining) total-volume))
    )
    ;; Only distribute if trader has volume and reward is meaningful
    (if (and (> trader-vol u0) (> reward-share u0))
      (begin
        ;; Store reward for trader to claim later
        (map-set trader-rewards { epoch: epoch, trader: trader } reward-share)
        {
          epoch: epoch,
          total-volume: total-volume,
          remaining: (- remaining reward-share)
        }
      )
      state
    )
  )
)

;; Claim Rewards
;; Allows traders to claim their earned rewards for a specific epoch
(define-public (claim-rewards (epoch uint))
  (let
    (
      (caller tx-sender)
      (reward (default-to u0 (map-get? trader-rewards { epoch: epoch, trader: caller })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, trader: caller })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (asserts! (> reward u0) ERR-NO-REWARDS)
    (asserts! (not is-claimed) ERR-ALREADY-CLAIMED)
    (asserts! is-distributed ERR-ALREADY-DISTRIBUTED)

    ;; Mark as claimed
    (map-set rewards-claimed { epoch: epoch, trader: caller } true)

    ;; Transfer rewards to trader
    (try! (as-contract (contract-call? .governance-token transfer reward tx-sender caller none)))

    (print
      {
        event: "rewards-claimed",
        epoch: epoch,
        trader: caller,
        amount: reward
      }
    )
    (ok reward)
  )
)

;; Claim All Rewards
;; Allows traders to claim all their earned rewards for specific epochs
;; Note: Due to Clarity limitations, caller must pass explicit epoch list
;; Example: (claim-all-rewards (list u1 u2 u3)) for epochs 1, 2, 3
(define-public (claim-all-rewards (epochs (list 20 uint)))
  (let
    (
      (caller tx-sender)
      (initial-state { trader: caller, total: u0 })
      (final-state (fold claim-rewards-for-epoch epochs initial-state))
      (claimable (get total final-state))
    )
    (asserts! (> claimable u0) ERR-NO-REWARDS)
    (ok claimable)
  )
)

;; Helper to claim rewards for a single epoch
;; Returns updated state tuple (required by fold)
(define-private (claim-rewards-for-epoch (epoch uint) (state { trader: principal, total: uint }))
  (let
    (
      (trader (get trader state))
      (total (get total state))
      (reward (default-to u0 (map-get? trader-rewards { epoch: epoch, trader: trader })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, trader: trader })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      (match (as-contract (contract-call? .governance-token transfer reward tx-sender trader none))
        success (begin
          (map-set rewards-claimed { epoch: epoch, trader: trader } true)
          { trader: trader, total: (+ total reward) }
        )
        error state  ;; If transfer fails, return unchanged state
      )
      state  ;; No reward to claim, return unchanged state
    )
  )
)

;; Read-Only Functions

;; Get trader's trading volume for an epoch
(define-read-only (get-trader-volume (epoch uint) (trader principal))
  (ok (default-to u0 (map-get? trader-volume { epoch: epoch, trader: trader }))))

;; Get total trading volume for an epoch
(define-read-only (get-epoch-total-volume (epoch uint))
  (ok (default-to u0 (map-get? epoch-total-volume { epoch: epoch }))))

;; Get trader's earned rewards for an epoch
(define-read-only (get-trader-rewards (epoch uint) (trader principal))
  (ok (default-to u0 (map-get? trader-rewards { epoch: epoch, trader: trader }))))

;; Check if rewards have been claimed
(define-read-only (is-rewards-claimed (epoch uint) (trader principal))
  (ok (default-to false (map-get? rewards-claimed { epoch: epoch, trader: trader }))))

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

;; Get total trading volume across all epochs
(define-read-only (get-total-trading-volume)
  (ok (var-get total-trading-volume)))

;; Get pending rewards for a trader for specific epochs
;; Note: Caller must pass explicit epoch list due to Clarity limitations
;; Example: (get-pending-rewards trader (list u1 u2 u3)) for epochs 1, 2, 3
(define-read-only (get-pending-rewards (trader principal) (epochs (list 20 uint)))
  (let
    (
      (initial-state { trader: trader, total: u0 })
      (final-state (fold get-pending-for-epoch epochs initial-state))
    )
    (ok (get total final-state))
  )
)

;; Helper to get pending rewards for a single epoch
;; Returns updated state tuple with accumulated total
(define-private (get-pending-for-epoch (epoch uint) (state { trader: principal, total: uint }))
  (let
    (
      (trader (get trader state))
      (total (get total state))
      (reward (default-to u0 (map-get? trader-rewards { epoch: epoch, trader: trader })))
      (is-claimed (default-to false (map-get? rewards-claimed { epoch: epoch, trader: trader })))
      (is-distributed (default-to false (map-get? epoch-distributed { epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      { trader: trader, total: (+ total reward) }
      state
    )
  )
)

;; Helper: always returns false (used to create typed empty list)
(define-private (always-false (p principal)) false)

;; Helper function to get traders for an epoch
;; This is a simplified version - in production, you'd need a way to track all traders per epoch
;; TODO: Implement trader registry to track all traders per epoch
(define-private (get-traders-for-epoch (epoch uint))
  ;; Returns typed empty list - filter removes the dummy element
  ;; In production, replace with actual trader registry lookup
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
