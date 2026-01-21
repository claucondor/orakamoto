;; LP Rewards Contract for StackPredict Protocol
;; Distributes $PRED governance tokens to liquidity providers
;; Based on time-weighted liquidity provision

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant EPOCH-DURATION u1008) ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant MIN-REWARD-THRESHOLD u1000000) ;; Minimum 1 USDC equivalent to earn rewards
(define-constant MAX-EPOCHS-BACK u52) ;; Track up to 52 weeks of epochs

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u700))
(define-constant ERR-NOT-TOKEN-OWNER (err u701))
(define-constant ERR-ZERO-AMOUNT (err u702))
(define-constant ERR-INSUFFICIENT-BALANCE (err u703))
(define-constant ERR-ALREADY-CLAIMED (err u704))
(define-constant ERR-NO-REWARDS (err u705))
(define-constant ERR-INVALID-EPOCH (err u706))
(define-constant ERR-EPOCH-NOT-ENDED (err u707))
(define-constant ERR-ALREADY-DISTRIBUTED (err u708))
(define-constant ERR-NO-ELIGIBLE-LPS (err u709))

;; Data Variables
(define-data-var total-rewards-distributed uint u0)
(define-data-var current-epoch uint u1)
(define-data-var epoch-start-block uint u0)
(define-data-var total-liquidity-points uint u0) ;; Sum of all LP liquidity points for current epoch

;; Data Maps

;; Track LP liquidity points per market per epoch
;; liquidity-points = sum of (lp-balance * blocks-held) for each epoch
(define-map market-lp-points
  { market: principal, epoch: uint, lp: principal }
  uint
)

;; Track total liquidity points per market per epoch
(define-map market-total-points
  { market: principal, epoch: uint }
  uint
)

;; Track rewards earned per LP per market per epoch
(define-map lp-rewards
  { market: principal, epoch: uint, lp: principal }
  uint
)

;; Track if rewards have been claimed
(define-map rewards-claimed
  { market: principal, epoch: uint, lp: principal }
  bool
)

;; Track epoch distribution status
(define-map epoch-distributed
  { market: principal, epoch: uint }
  bool
)

;; Track LP balance snapshots for calculating points
;; Used to calculate points when LPs add/remove liquidity
(define-map lp-balance-snapshot
  { market: principal, lp: principal }
  { balance: uint, last-update: uint }
)

;; SIP-010 Token Implementation
;; Note: This contract doesn't mint tokens directly.
;; Minting is done by the governance contract or through a separate reward distributor.
;; This contract only distributes already-minted tokens.

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
  (ok "StackPredict LP Rewards"))

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
;; Called when the first LP deposit is made for a market
(define-public (initialize-epoch (market principal))
  (let
    (
      (current-epoch-start (var-get epoch-start-block))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq current-epoch-start u0) ERR-ALREADY-DISTRIBUTED)

    (var-set epoch-start-block block-height)
    (print {event: "epoch-initialized", market: market, start-block: block-height})
    (ok true)))

;; Record LP Deposit
;; Called by market-pool when LP adds liquidity
;; Calculates and stores liquidity points for the LP
(define-public (record-lp-deposit
    (market principal)
    (lp principal)
    (new-balance uint)
  )
  (let
    (
      (epoch (var-get current-epoch))
      (epoch-start (var-get epoch-start-block))
      (snapshot (map-get? lp-balance-snapshot { market: market, lp: lp }))
      (prev-balance (default-to u0 (get balance snapshot)))
      (prev-update (default-to epoch-start (get last-update snapshot)))
      ;; Calculate points accumulated until now
      (blocks-held (- block-height prev-update))
      (points-accumulated (* prev-balance blocks-held))
      ;; Get existing points for this epoch
      (existing-points (default-to u0 (map-get? market-lp-points { market: market, epoch: epoch, lp: lp })))
      (total-points (default-to u0 (map-get? market-total-points { market: market, epoch: epoch })))
    )
    (asserts! (or (is-eq contract-caller CONTRACT-OWNER) (is-eq contract-caller market)) ERR-NOT-AUTHORIZED)

    ;; Update points for the period held
    (if (> blocks-held u0)
      (begin
        (map-set market-lp-points
          { market: market, epoch: epoch, lp: lp }
          (+ existing-points points-accumulated)
        )
        (map-set market-total-points
          { market: market, epoch: epoch }
          (+ total-points points-accumulated)
        )
        u0
      )
      u0
    )

    ;; Update snapshot with new balance
    (map-set lp-balance-snapshot
      { market: market, lp: lp }
      { balance: new-balance, last-update: block-height }
    )

    (print
      {
        event: "lp-deposit-recorded",
        market: market,
        lp: lp,
        new-balance: new-balance,
        points-accumulated: points-accumulated,
        epoch: epoch
      }
    )
    (ok true)))

;; Record LP Withdrawal
;; Called by market-pool when LP removes liquidity
;; Calculates and stores liquidity points for the LP
(define-public (record-lp-withdrawal
    (market principal)
    (lp principal)
    (new-balance uint)
  )
  (let
    (
      (epoch (var-get current-epoch))
      (epoch-start (var-get epoch-start-block))
      (snapshot (map-get? lp-balance-snapshot { market: market, lp: lp }))
      (prev-balance (default-to u0 (get balance snapshot)))
      (prev-update (default-to epoch-start (get last-update snapshot)))
      ;; Calculate points accumulated until now
      (blocks-held (- block-height prev-update))
      (points-accumulated (* prev-balance blocks-held))
      ;; Get existing points for this epoch
      (existing-points (default-to u0 (map-get? market-lp-points { market: market, epoch: epoch, lp: lp })))
      (total-points (default-to u0 (map-get? market-total-points { market: market, epoch: epoch })))
    )
    (asserts! (or (is-eq contract-caller CONTRACT-OWNER) (is-eq contract-caller market)) ERR-NOT-AUTHORIZED)

    ;; Update points for the period held
    (if (> blocks-held u0)
      (begin
        (map-set market-lp-points
          { market: market, epoch: epoch, lp: lp }
          (+ existing-points points-accumulated)
        )
        (map-set market-total-points
          { market: market, epoch: epoch }
          (+ total-points points-accumulated)
        )
      )
      true
    )

    ;; Update snapshot with new balance
    (map-set lp-balance-snapshot
      { market: market, lp: lp }
      { balance: new-balance, last-update: block-height }
    )

    (print
      {
        event: "lp-withdrawal-recorded",
        market: market,
        lp: lp,
        new-balance: new-balance,
        points-accumulated: points-accumulated,
        epoch: epoch
      }
    )
    (ok true)))

;; Distribute Rewards for Epoch
;; Called at the end of an epoch to distribute $PRED rewards to LPs
;; Rewards are proportional to liquidity points (amount * time)
(define-public (distribute-rewards
    (market principal)
    (epoch uint)
    (reward-amount uint)
  )
  (let
    (
      (total-points (default-to u0 (map-get? market-total-points { market: market, epoch: epoch })))
      (is-distributed (default-to false (map-get? epoch-distributed { market: market, epoch: epoch })))
      (epoch-end (+ (var-get epoch-start-block) (* (- epoch u1) EPOCH-DURATION) EPOCH-DURATION))
    )
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> reward-amount u0) ERR-ZERO-AMOUNT)
    (asserts! (> total-points u0) ERR-NO-ELIGIBLE-LPS)
    (asserts! (not is-distributed) ERR-ALREADY-DISTRIBUTED)
    (asserts! (>= block-height epoch-end) ERR-EPOCH-NOT-ENDED)

    ;; Transfer rewards to this contract first
    (try! (contract-call? .governance-token transfer reward-amount CONTRACT-OWNER (as-contract tx-sender) none))

    ;; Calculate and distribute rewards to each LP
    (let
      (
        (lp-list (get-lps-for-epoch market epoch))
        (distributed (fold distribute-to-lp lp-list { market: market, epoch: epoch, total-points: total-points, remaining: reward-amount }))
      )
      (asserts! (> (get remaining distributed) u0) ERR-NO-ELIGIBLE-LPS)

      ;; Mark epoch as distributed
      (map-set epoch-distributed { market: market, epoch: epoch } true)

      (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) reward-amount))

      (print
        {
          event: "rewards-distributed",
          market: market,
          epoch: epoch,
          reward-amount: reward-amount,
          total-points: total-points,
          lps-count: (len lp-list)
        }
      )
      (ok true)
    )
  )
)

;; Helper function to distribute rewards to a single LP
(define-private (distribute-to-lp
    (lp principal)
    (state { market: principal, epoch: uint, total-points: uint, remaining: uint })
  )
  (let
    (
      (market (get market state))
      (epoch (get epoch state))
      (total-points (get total-points state))
      (remaining (get remaining state))
      (lp-points (default-to u0 (map-get? market-lp-points { market: market, epoch: epoch, lp: lp })))
      ;; Calculate reward share (proportional to points)
      (reward-share (/ (* lp-points remaining) total-points))
    )
    ;; Only distribute if LP has points and reward is meaningful
    (if (and (> lp-points u0) (> reward-share u0))
      (begin
        ;; Store reward for LP to claim later
        (map-set lp-rewards { market: market, epoch: epoch, lp: lp } reward-share)
        {
          market: market,
          epoch: epoch,
          total-points: total-points,
          remaining: (- remaining reward-share)
        }
      )
      state
    )
  )
)

;; Claim Rewards
;; Allows LPs to claim their earned rewards for a specific market and epoch
(define-public (claim-rewards (market principal) (epoch uint))
  (let
    (
      (caller tx-sender)
      (reward (default-to u0 (map-get? lp-rewards { market: market, epoch: epoch, lp: caller })))
      (is-claimed (default-to false (map-get? rewards-claimed { market: market, epoch: epoch, lp: caller })))
      (is-distributed (default-to false (map-get? epoch-distributed { market: market, epoch: epoch })))
    )
    (asserts! (> reward u0) ERR-NO-REWARDS)
    (asserts! (not is-claimed) ERR-ALREADY-CLAIMED)
    (asserts! is-distributed ERR-ALREADY-DISTRIBUTED)

    ;; Mark as claimed
    (map-set rewards-claimed { market: market, epoch: epoch, lp: caller } true)

    ;; Transfer rewards to LP
    (try! (as-contract (contract-call? .governance-token transfer reward tx-sender caller none)))

    (print
      {
        event: "rewards-claimed",
        market: market,
        epoch: epoch,
        lp: caller,
        amount: reward
      }
    )
    (ok reward)
  )
)

;; Claim All Rewards
;; Allows LPs to claim all their earned rewards for specific epochs
;; Note: Due to Clarity limitations, caller must pass explicit epoch list
;; Example: (claim-all-rewards market (list u1 u2 u3)) for epochs 1, 2, 3
(define-public (claim-all-rewards (market principal) (epochs (list 20 uint)))
  (let
    (
      (caller tx-sender)
      (initial-state { market: market, lp: caller, total: u0 })
      (final-state (fold claim-rewards-for-epoch epochs initial-state))
      (claimable (get total final-state))
    )
    (asserts! (> claimable u0) ERR-NO-REWARDS)
    (ok claimable)
  )
)

;; Helper to claim rewards for a single epoch
;; Returns updated state tuple (required by fold)
(define-private (claim-rewards-for-epoch (epoch uint) (state { market: principal, lp: principal, total: uint }))
  (let
    (
      (market (get market state))
      (lp (get lp state))
      (total (get total state))
      (reward (default-to u0 (map-get? lp-rewards { market: market, epoch: epoch, lp: lp })))
      (is-claimed (default-to false (map-get? rewards-claimed { market: market, epoch: epoch, lp: lp })))
      (is-distributed (default-to false (map-get? epoch-distributed { market: market, epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      (match (as-contract (contract-call? .governance-token transfer reward tx-sender lp none))
        success (begin
          (map-set rewards-claimed { market: market, epoch: epoch, lp: lp } true)
          { market: market, lp: lp, total: (+ total reward) }
        )
        error state  ;; If transfer fails, return unchanged state
      )
      state  ;; No reward to claim, return unchanged state
    )
  )
)

;; Read-Only Functions

;; Get LP's liquidity points for a market and epoch
(define-read-only (get-lp-points (market principal) (epoch uint) (lp principal))
  (ok (default-to u0 (map-get? market-lp-points { market: market, epoch: epoch, lp: lp }))))

;; Get total liquidity points for a market and epoch
(define-read-only (get-total-points (market principal) (epoch uint))
  (ok (default-to u0 (map-get? market-total-points { market: market, epoch: epoch }))))

;; Get LP's earned rewards for a market and epoch
(define-read-only (get-lp-rewards (market principal) (epoch uint) (lp principal))
  (ok (default-to u0 (map-get? lp-rewards { market: market, epoch: epoch, lp: lp }))))

;; Check if rewards have been claimed
(define-read-only (is-rewards-claimed (market principal) (epoch uint) (lp principal))
  (ok (default-to false (map-get? rewards-claimed { market: market, epoch: epoch, lp: lp }))))

;; Check if epoch has been distributed
(define-read-only (is-epoch-distributed (market principal) (epoch uint))
  (ok (default-to false (map-get? epoch-distributed { market: market, epoch: epoch }))))

;; Get current epoch
(define-read-only (get-current-epoch)
  (ok (var-get current-epoch)))

;; Get epoch start block
(define-read-only (get-epoch-start-block)
  (ok (var-get epoch-start-block)))

;; Get total rewards distributed
(define-read-only (get-total-rewards-distributed)
  (ok (var-get total-rewards-distributed)))

;; Get LP's current balance snapshot
(define-read-only (get-lp-balance-snapshot (market principal) (lp principal))
  (ok (map-get? lp-balance-snapshot { market: market, lp: lp })))

;; Get pending rewards for an LP for specific epochs
;; Note: Caller must pass explicit epoch list due to Clarity limitations
;; Example: (get-pending-rewards market lp (list u1 u2 u3)) for epochs 1, 2, 3
(define-read-only (get-pending-rewards (market principal) (lp principal) (epochs (list 20 uint)))
  (let
    (
      (initial-state { market: market, lp: lp, total: u0 })
      (final-state (fold get-pending-for-epoch epochs initial-state))
    )
    (ok (get total final-state))
  )
)

;; Helper to get pending rewards for a single epoch
;; Returns updated state tuple with accumulated total
(define-private (get-pending-for-epoch (epoch uint) (state { market: principal, lp: principal, total: uint }))
  (let
    (
      (market (get market state))
      (lp (get lp state))
      (total (get total state))
      (reward (default-to u0 (map-get? lp-rewards { market: market, epoch: epoch, lp: lp })))
      (is-claimed (default-to false (map-get? rewards-claimed { market: market, epoch: epoch, lp: lp })))
      (is-distributed (default-to false (map-get? epoch-distributed { market: market, epoch: epoch })))
    )
    (if (and (> reward u0) (not is-claimed) is-distributed)
      { market: market, lp: lp, total: (+ total reward) }
      state
    )
  )
)

;; Helper: always returns false (used to create typed empty list)
(define-private (always-false (p principal)) false)

;; Helper function to get LPs for an epoch
;; This is a simplified version - in production, you'd need a way to track all LPs per market
;; TODO: Implement LP registry to track all LPs per market
(define-private (get-lps-for-epoch (market principal) (epoch uint))
  ;; Returns typed empty list - filter removes the dummy element
  ;; In production, replace with actual LP registry lookup
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
