;; Governance Contract for StackPredict Protocol
;; Handles proposal creation, voting, and execution
;; Uses vote-escrow for voting power calculation

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)
(define-constant VOTING-PERIOD u1008) ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant TIMELOCK u288) ;; ~2 days in blocks (144 blocks/day * 2)
(define-constant QUORUM-PERCENT u10) ;; 10% quorum required
(define-constant MIN-PROPOSAL-THRESHOLD u100000000) ;; 1 PRED (8 decimals) minimum voting power to propose

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u900))
(define-constant ERR-NOT-TOKEN-OWNER (err u901))
(define-constant ERR-ZERO-AMOUNT (err u902))
(define-constant ERR-INSUFFICIENT-BALANCE (err u903))
(define-constant ERR-INVALID-PROPOSAL (err u904))
(define-constant ERR-PROPOSAL-NOT-ACTIVE (err u905))
(define-constant ERR-ALREADY-VOTED (err u906))
(define-constant ERR-VOTING-NOT-ENDED (err u907))
(define-constant ERR-QUORUM-NOT-REACHED (err u908))
(define-constant ERR-PROPOSAL-NOT-EXECUTED (err u909))
(define-constant ERR-PROPOSAL-ALREADY-EXECUTED (err u910))
(define-constant ERR-PROPOSAL-NOT-READY (err u911))
(define-constant ERR-INVALID-PROPOSAL-TYPE (err u912))
(define-constant ERR-PROPOSAL-ALREADY-CANCELLED (err u913))
(define-constant ERR-COOLDOWN-NOT-ENDED (err u914))
(define-constant ERR-EMERGENCY-THRESHOLD-NOT-REACHED (err u915))
(define-constant ERR-EXECUTION-FAILED (err u916))

;; Proposal Types
(define-constant PROPOSAL-TYPE-PARAMETER-CHANGE u0)
(define-constant PROPOSAL-TYPE-TREASURY-SPEND u1)
(define-constant PROPOSAL-TYPE-DISPUTE-RESOLUTION u2)
(define-constant PROPOSAL-TYPE-ORACLE-WHITELIST u3)
(define-constant PROPOSAL-TYPE-EMERGENCY-ACTION u4)

;; Data Variables
(define-data-var proposal-count uint u0)
(define-data-var total-voting-power uint u0)

;; Governable Parameters
(define-data-var trading-fee-bp uint u100) ;; 1% = 100 basis points
(define-data-var lp-fee-share-bp uint u7000) ;; 70% = 7000 basis points
(define-data-var creator-fee-share-bp uint u1000) ;; 10% = 1000 basis points
(define-data-var protocol-fee-share-bp uint u2000) ;; 20% = 2000 basis points
(define-data-var minimum-collateral uint u50000000) ;; 50 USDC
(define-data-var resolution-window uint u1008) ;; ~7 days
(define-data-var dispute-window uint u1008) ;; ~7 days
(define-data-var dispute-stake uint u100000000) ;; 1 PRED
(define-data-var emergency-quorum-percent uint u30) ;; 30% for emergency
(define-data-var emergency-approval-percent uint u80) ;; 80% approval for emergency
(define-data-var protocol-treasury principal tx-sender) ;; Protocol treasury (defaults to deployer)

;; Proposal Cooldown (1 proposal per week per address)
(define-map proposal-cooldown
  principal
  uint ;; block height when cooldown ends
)

;; Proposal Structure
(define-map proposals
  uint
  {
    id: uint,
    proposer: principal,
    proposal-type: uint,
    title: (string-utf8 256),
    description: (string-utf8 1024),
    target-contract: (optional principal),
    function-name: (optional (string-utf8 64)),
    function-args: (optional (buff 2048)), ;; Serialized arguments
    created-at: uint,
    voting-end: uint,
    timelock-end: uint,
    for-votes: uint,
    against-votes: uint,
    abstain-votes: uint,
    quorum-reached: bool,
    executed: bool,
    cancelled: bool,
    emergency: bool
  }
)

;; Track votes by proposal and voter
(define-map votes
  { proposal: uint, voter: principal }
  {
    vote-type: uint, ;; 0 = against, 1 = for, 2 = abstain
    voting-power: uint
  }
)

;; Track proposal IDs by proposer
(define-map proposer-proposals
  principal
  (list 50 uint)
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
  (ok "StackPredict Governance"))

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

;; ============================================
;; GOVERNANCE FUNCTIONS
;; ============================================

;; Create a new proposal
;; Proposal types:
;; 0 = PARAMETER_CHANGE (change governable parameters)
;; 1 = TREASURY_SPEND (spend from treasury)
;; 2 = DISPUTE_RESOLUTION (resolve disputed market)
;; 3 = ORACLE_WHITELIST (whitelist oracle)
;; 4 = EMERGENCY_ACTION (emergency pause/fix)
(define-public (create-proposal
    (proposal-type uint)
    (title (string-utf8 256))
    (description (string-utf8 1024))
    (target-contract (optional principal))
    (function-name (optional (string-utf8 64)))
    (function-args (optional (buff 2048)))
    (emergency bool)
  )
  (let
    (
      (proposer tx-sender)
      (proposal-id (+ (var-get proposal-count) u1))
      (voting-end (+ block-height VOTING-PERIOD))
      (timelock-end (+ voting-end TIMELOCK))
      (voting-power-result (contract-call? .vote-escrow get-voting-power proposer))
      (voting-power (unwrap! voting-power-result ERR-INVALID-PROPOSAL))
      (cooldown-end (default-to u0 (map-get? proposal-cooldown proposer)))
    )
    ;; Validate proposal type
    (asserts! (or
      (is-eq proposal-type PROPOSAL-TYPE-PARAMETER-CHANGE)
      (is-eq proposal-type PROPOSAL-TYPE-TREASURY-SPEND)
      (is-eq proposal-type PROPOSAL-TYPE-DISPUTE-RESOLUTION)
      (is-eq proposal-type PROPOSAL-TYPE-ORACLE-WHITELIST)
      (is-eq proposal-type PROPOSAL-TYPE-EMERGENCY-ACTION)
    ) ERR-INVALID-PROPOSAL-TYPE)

    ;; Check minimum voting power threshold (except for emergency proposals)
    (asserts! (or emergency (>= voting-power MIN-PROPOSAL-THRESHOLD)) ERR-INVALID-PROPOSAL)

    ;; Check proposal cooldown (1 proposal per week)
    (asserts! (>= block-height cooldown-end) ERR-COOLDOWN-NOT-ENDED)

    ;; Check if emergency proposal has higher threshold
    (if emergency
      (asserts! (>= voting-power (* MIN-PROPOSAL-THRESHOLD u10)) ERR-INVALID-PROPOSAL)
      true
    )

    ;; Create proposal
    (map-set proposals
      proposal-id
      {
        id: proposal-id,
        proposer: proposer,
        proposal-type: proposal-type,
        title: title,
        description: description,
        target-contract: target-contract,
        function-name: function-name,
        function-args: function-args,
        created-at: block-height,
        voting-end: voting-end,
        timelock-end: timelock-end,
        for-votes: u0,
        against-votes: u0,
        abstain-votes: u0,
        quorum-reached: false,
        executed: false,
        cancelled: false,
        emergency: emergency
      }
    )

    ;; Update proposal count
    (var-set proposal-count proposal-id)

    ;; Add proposal to proposer's list (simplified - just append, no limit enforcement)
    ;; Note: In production, you'd want to implement proper list management
    (let
      (
        (proposer-list (default-to (list) (map-get? proposer-proposals proposer)))
        (new-list (unwrap-panic (as-max-len? (append proposer-list proposal-id) u50)))
      )
      (map-set proposer-proposals proposer new-list)
    )

    ;; Set cooldown period (1 week from now)
    (map-set proposal-cooldown proposer (+ block-height u1008))

    (print
      {
        event: "proposal-created",
        proposal-id: proposal-id,
        proposer: proposer,
        proposal-type: proposal-type,
        title: title,
        voting-end: voting-end,
        emergency: emergency
      }
    )

    (ok proposal-id)
  )
)

;; Vote on a proposal
;; vote-type: 0 = against, 1 = for, 2 = abstain
(define-public (vote (proposal-id uint) (vote-type uint))
  (let
    (
      (caller tx-sender)
      (proposal (unwrap! (map-get? proposals proposal-id) ERR-INVALID-PROPOSAL))
      (voting-power-result (contract-call? .vote-escrow get-voting-power caller))
      (voting-power (unwrap! voting-power-result ERR-INVALID-PROPOSAL))
      (current-vote (map-get? votes { proposal: proposal-id, voter: caller }))
    )
    ;; Validate vote type
    (asserts! (or (is-eq vote-type u0) (is-eq vote-type u1) (is-eq vote-type u2)) ERR-INVALID-PROPOSAL)

    ;; Check if proposal is active
    (asserts! (<= block-height (get voting-end proposal)) ERR-PROPOSAL-NOT-ACTIVE)

    ;; Check if already voted
    (asserts! (is-none current-vote) ERR-ALREADY-VOTED)

    ;; Check if voter has voting power
    (asserts! (> voting-power u0) ERR-ZERO-AMOUNT)

    ;; Record vote
    (map-set votes
      { proposal: proposal-id, voter: caller }
      { vote-type: vote-type, voting-power: voting-power }
    )

    ;; Update proposal vote counts
    (let
      (
        (new-for (if (is-eq vote-type u1) (+ (get for-votes proposal) voting-power) (get for-votes proposal)))
        (new-against (if (is-eq vote-type u0) (+ (get against-votes proposal) voting-power) (get against-votes proposal)))
        (new-abstain (if (is-eq vote-type u2) (+ (get abstain-votes proposal) voting-power) (get abstain-votes proposal)))
      )
      (map-set proposals
        proposal-id
        (merge proposal
          {
            for-votes: new-for,
            against-votes: new-against,
            abstain-votes: new-abstain
          }
        )
      )
    )

    (print
      {
        event: "vote-cast",
        proposal-id: proposal-id,
        voter: caller,
        vote-type: vote-type,
        voting-power: voting-power
      }
    )

    (ok true)
  )
)

;; Execute a proposal after voting period ends
(define-public (execute-proposal (proposal-id uint))
  (let
    (
      (proposal (unwrap! (map-get? proposals proposal-id) ERR-INVALID-PROPOSAL))
      (total-votes (+ (get for-votes proposal) (get against-votes proposal) (get abstain-votes proposal)))
      (voting-end (get voting-end proposal))
      (timelock-end (get timelock-end proposal))
      (quorum (if (get emergency proposal)
        (/ (* (var-get total-voting-power) (var-get emergency-quorum-percent)) u100)
        (/ (* (var-get total-voting-power) QUORUM-PERCENT) u100)
      ))
      (approval-threshold (if (get emergency proposal)
        (/ (* total-votes (var-get emergency-approval-percent)) u100)
        (/ total-votes u2) ;; 50% for non-emergency
      ))
    )
    ;; Check if proposal exists and not already executed or cancelled
    (asserts! (not (get executed proposal)) ERR-PROPOSAL-ALREADY-EXECUTED)
    (asserts! (not (get cancelled proposal)) ERR-INVALID-PROPOSAL)

    ;; Check if voting period has ended
    (asserts! (> block-height voting-end) ERR-VOTING-NOT-ENDED)

    ;; Check if timelock has ended
    (asserts! (> block-height timelock-end) ERR-PROPOSAL-NOT-READY)

    ;; Check quorum
    (asserts! (>= total-votes quorum) ERR-QUORUM-NOT-REACHED)

    ;; Check if proposal has majority (for votes > against votes)
    (asserts! (> (get for-votes proposal) approval-threshold) ERR-PROPOSAL-NOT-EXECUTED)

    ;; Mark as executed
    (map-set proposals
      proposal-id
      (merge proposal
        {
          executed: true,
          quorum-reached: true
        }
      )
    )

    ;; Execute proposal action based on type
    (unwrap! (execute-proposal-action (get proposal-type proposal) proposal) ERR-EXECUTION-FAILED)

    (print
      {
        event: "proposal-executed",
        proposal-id: proposal-id,
        for-votes: (get for-votes proposal),
        against-votes: (get against-votes proposal),
        quorum-reached: true
      }
    )

    (ok true)
  )
)

;; Cancel a proposal (only proposer can cancel before execution)
(define-public (cancel-proposal (proposal-id uint))
  (let
    (
      (proposal (unwrap! (map-get? proposals proposal-id) ERR-INVALID-PROPOSAL))
      (caller tx-sender)
    )
    ;; Only proposer can cancel
    (asserts! (is-eq caller (get proposer proposal)) ERR-NOT-AUTHORIZED)

    ;; Check if not already executed or cancelled
    (asserts! (not (get executed proposal)) ERR-PROPOSAL-ALREADY-EXECUTED)
    (asserts! (not (get cancelled proposal)) ERR-PROPOSAL-ALREADY-CANCELLED)

    ;; Can only cancel before timelock ends
    (asserts! (<= block-height (get timelock-end proposal)) ERR-PROPOSAL-NOT-READY)

    ;; Mark as cancelled
    (map-set proposals
      proposal-id
      (merge proposal { cancelled: true })
    )

    (print
      {
        event: "proposal-cancelled",
        proposal-id: proposal-id,
        proposer: caller
      }
    )

    (ok true)
  )
)

;; ============================================
;; PARAMETER CHANGE EXECUTION
;; ============================================

(define-private (execute-parameter-change (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  ;; For parameter changes, we assume the function-args contain the new parameter value
  ;; In a real implementation, this would decode and apply the parameter change
  (ok true)
)

;; ============================================
;; TREASURY SPEND EXECUTION
;; ============================================

(define-private (execute-treasury-spend (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  ;; For treasury spend, we assume the function-args contain recipient and amount
  ;; In a real implementation, this would decode and transfer from treasury
  (ok true)
)

;; ============================================
;; DISPUTE RESOLUTION EXECUTION
;; ============================================

(define-private (execute-dispute-resolution (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  ;; For dispute resolution, we would call the oracle-resolver or market-pool
  ;; to set the correct winning outcome
  (ok true)
)

;; ============================================
;; ORACLE WHITELIST EXECUTION
;; ============================================

(define-private (execute-oracle-whitelist (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  ;; For oracle whitelisting, we would add the oracle to a whitelist
  ;; In a real implementation, this would call oracle-resolver to whitelist
  (ok true)
)

;; ============================================
;; EMERGENCY ACTION EXECUTION
;; ============================================

(define-private (execute-emergency-action (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  ;; Emergency actions could include pausing contracts, emergency upgrades, etc.
  ;; In a real implementation, this would call the target contract with the emergency action
  (ok true)
)

;; Helper function to execute proposal action with proper error handling
(define-private (execute-proposal-action (proposal-type uint) (proposal { id: uint, proposer: principal, proposal-type: uint, title: (string-utf8 256), description: (string-utf8 1024), target-contract: (optional principal), function-name: (optional (string-utf8 64)), function-args: (optional (buff 2048)), created-at: uint, voting-end: uint, timelock-end: uint, for-votes: uint, against-votes: uint, abstain-votes: uint, quorum-reached: bool, executed: bool, cancelled: bool, emergency: bool }))
  (let
    (
      (result (if (is-eq proposal-type PROPOSAL-TYPE-PARAMETER-CHANGE)
        (execute-parameter-change proposal)
        (if (is-eq proposal-type PROPOSAL-TYPE-TREASURY-SPEND)
          (execute-treasury-spend proposal)
          (if (is-eq proposal-type PROPOSAL-TYPE-DISPUTE-RESOLUTION)
            (execute-dispute-resolution proposal)
            (if (is-eq proposal-type PROPOSAL-TYPE-ORACLE-WHITELIST)
              (execute-oracle-whitelist proposal)
              (if (is-eq proposal-type PROPOSAL-TYPE-EMERGENCY-ACTION)
                (execute-emergency-action proposal)
                (ok true)
              )
            )
          )
        )
      ))
    )
    result
  )
)

;; ============================================
;; PARAMETER MANAGEMENT
;; ============================================

;; Update trading fee (basis points)
(define-public (update-trading-fee (new-fee uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-fee u10000) ERR-INVALID-PROPOSAL) ;; Max 100%
    (var-set trading-fee-bp new-fee)
    (print { event: "parameter-updated", parameter: "trading-fee-bp", value: new-fee })
    (ok true)))

;; Update LP fee share (basis points)
(define-public (update-lp-fee-share (new-share uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-share u10000) ERR-INVALID-PROPOSAL)
    (var-set lp-fee-share-bp new-share)
    (print { event: "parameter-updated", parameter: "lp-fee-share-bp", value: new-share })
    (ok true)))

;; Update creator fee share (basis points)
(define-public (update-creator-fee-share (new-share uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-share u10000) ERR-INVALID-PROPOSAL)
    (var-set creator-fee-share-bp new-share)
    (print { event: "parameter-updated", parameter: "creator-fee-share-bp", value: new-share })
    (ok true)))

;; Update protocol fee share (basis points)
(define-public (update-protocol-fee-share (new-share uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-share u10000) ERR-INVALID-PROPOSAL)
    (var-set protocol-fee-share-bp new-share)
    (print { event: "parameter-updated", parameter: "protocol-fee-share-bp", value: new-share })
    (ok true)))

;; Update minimum collateral
(define-public (update-minimum-collateral (new-collateral uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-collateral u0) ERR-ZERO-AMOUNT)
    (var-set minimum-collateral new-collateral)
    (print { event: "parameter-updated", parameter: "minimum-collateral", value: new-collateral })
    (ok true)))

;; Update resolution window
(define-public (update-resolution-window (new-window uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-window u0) ERR-ZERO-AMOUNT)
    (var-set resolution-window new-window)
    (print { event: "parameter-updated", parameter: "resolution-window", value: new-window })
    (ok true)))

;; Update dispute window
(define-public (update-dispute-window (new-window uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-window u0) ERR-ZERO-AMOUNT)
    (var-set dispute-window new-window)
    (print { event: "parameter-updated", parameter: "dispute-window", value: new-window })
    (ok true)))

;; Update dispute stake
(define-public (update-dispute-stake (new-stake uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-stake u0) ERR-ZERO-AMOUNT)
    (var-set dispute-stake new-stake)
    (print { event: "parameter-updated", parameter: "dispute-stake", value: new-stake })
    (ok true)))

;; Update protocol treasury address
(define-public (update-protocol-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set protocol-treasury new-treasury)
    (print { event: "parameter-updated", parameter: "protocol-treasury", value: new-treasury })
    (ok true)))

;; Update emergency quorum percent
(define-public (update-emergency-quorum-percent (new-percent uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-percent u100) ERR-INVALID-PROPOSAL)
    (var-set emergency-quorum-percent new-percent)
    (print { event: "parameter-updated", parameter: "emergency-quorum-percent", value: new-percent })
    (ok true)))

;; Update emergency approval percent
(define-public (update-emergency-approval-percent (new-percent uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-percent u100) ERR-INVALID-PROPOSAL)
    (var-set emergency-approval-percent new-percent)
    (print { event: "parameter-updated", parameter: "emergency-approval-percent", value: new-percent })
    (ok true)))

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (ok (map-get? proposals proposal-id)))

;; Get vote details
(define-read-only (get-vote (proposal-id uint) (voter principal))
  (ok (map-get? votes { proposal: proposal-id, voter: voter })))

;; Get proposer's proposals
(define-read-only (get-proposer-proposals (proposer principal))
  (ok (default-to (list) (map-get? proposer-proposals proposer))))

;; Get proposal count
(define-read-only (get-proposal-count)
  (ok (var-get proposal-count)))

;; Get total voting power
(define-read-only (get-total-voting-power)
  (ok (var-get total-voting-power)))

;; Get proposal cooldown for a user
(define-read-only (get-proposal-cooldown (user principal))
  (ok (default-to u0 (map-get? proposal-cooldown user))))

;; Get all governable parameters
(define-read-only (get-governance-parameters)
  (ok {
    trading-fee-bp: (var-get trading-fee-bp),
    lp-fee-share-bp: (var-get lp-fee-share-bp),
    creator-fee-share-bp: (var-get creator-fee-share-bp),
    protocol-fee-share-bp: (var-get protocol-fee-share-bp),
    minimum-collateral: (var-get minimum-collateral),
    resolution-window: (var-get resolution-window),
    dispute-window: (var-get dispute-window),
    dispute-stake: (var-get dispute-stake),
    protocol-treasury: (var-get protocol-treasury),
    emergency-quorum-percent: (var-get emergency-quorum-percent),
    emergency-approval-percent: (var-get emergency-approval-percent)
  }))

;; Check if proposal can be executed
(define-read-only (can-execute-proposal (proposal-id uint))
  (let
    (
      (proposal (map-get? proposals proposal-id))
    )
    (match proposal
      p
      (let
        (
          (total-votes (+ (get for-votes p) (get against-votes p) (get abstain-votes p)))
          (voting-end (get voting-end p))
          (timelock-end (get timelock-end p))
          (quorum (if (get emergency p)
            (/ (* (var-get total-voting-power) (var-get emergency-quorum-percent)) u100)
            (/ (* (var-get total-voting-power) QUORUM-PERCENT) u100)
          ))
          (approval-threshold (if (get emergency p)
            (/ (* total-votes (var-get emergency-approval-percent)) u100)
            (/ total-votes u2)
          ))
        )
        (ok {
          can-execute: (and
            (not (get executed p))
            (not (get cancelled p))
            (> block-height voting-end)
            (> block-height timelock-end)
            (>= total-votes quorum)
            (> (get for-votes p) approval-threshold)
          ),
          executed: (get executed p),
          cancelled: (get cancelled p),
          voting-ended: (> block-height voting-end),
          timelock-ended: (> block-height timelock-end),
          quorum-reached: (>= total-votes quorum),
          majority-reached: (> (get for-votes p) approval-threshold),
          for-votes: (get for-votes p),
          against-votes: (get against-votes p),
          quorum-required: quorum,
          approval-threshold: approval-threshold
        })
      )
      (ok {
          can-execute: false,
          executed: false,
          cancelled: false,
          voting-ended: false,
          timelock-ended: false,
          quorum-reached: false,
          majority-reached: false,
          for-votes: u0,
          against-votes: u0,
          quorum-required: u0,
          approval-threshold: u0
        })
    )
  )
)

;; Get proposal status as string
(define-read-only (get-proposal-status (proposal-id uint))
  (let
    (
      (proposal (map-get? proposals proposal-id))
    )
    (match proposal
      p
      (let
        (
          (total-votes (+ (get for-votes p) (get against-votes p) (get abstain-votes p)))
          (quorum-reached (>= total-votes (/ (* (var-get total-voting-power) QUORUM-PERCENT) u100)))
          (status (if (get executed p)
            "executed"
            (if (get cancelled p)
              "cancelled"
              (if (> block-height (get voting-end p))
                (if quorum-reached
                  "voting-ended-quorum-reached"
                  "voting-ended-quorum-not-reached"
                )
                "active"
              )
            )
          ))
        )
        (ok status)
      )
      (ok "not-found")
    )
  )
)

;; Get proposal type as string
(define-read-only (get-proposal-type-string (proposal-type uint))
  (ok (if (is-eq proposal-type PROPOSAL-TYPE-PARAMETER-CHANGE)
    "parameter-change"
    (if (is-eq proposal-type PROPOSAL-TYPE-TREASURY-SPEND)
      "treasury-spend"
      (if (is-eq proposal-type PROPOSAL-TYPE-DISPUTE-RESOLUTION)
        "dispute-resolution"
        (if (is-eq proposal-type PROPOSAL-TYPE-ORACLE-WHITELIST)
          "oracle-whitelist"
          (if (is-eq proposal-type PROPOSAL-TYPE-EMERGENCY-ACTION)
            "emergency-action"
            "unknown"
          )
        )
      )
    )
  )))
