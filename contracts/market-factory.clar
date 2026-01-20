;; Market Factory Contract
;; Creates and manages prediction market pools on StackPredict Protocol

;; Constants
(define-constant MINIMUM-COLLATERAL u50000000)     ;; 50 USDC (6 decimals)
(define-constant DEFAULT-RESOLUTION-WINDOW u1008)  ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant CONTRACT-OWNER tx-sender)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u2000))
(define-constant ERR-INVALID-QUESTION (err u2001))
(define-constant ERR-INVALID-DEADLINE (err u2002))
(define-constant ERR-INVALID-RESOLUTION-DEADLINE (err u2003))
(define-constant ERR-INSUFFICIENT-COLLATERAL (err u2004))
(define-constant ERR-MARKET-NOT-FOUND (err u2005))
(define-constant ERR-MARKET-ALREADY-INACTIVE (err u2007))
(define-constant ERR-ZERO-AMOUNT (err u2008))

;; Data Variables
(define-data-var market-count uint u0)

;; Market Data Structure
;; Each market stores:
;; - pool-contract: The deployed market-pool contract
;; - creator: The principal who created the market
;; - question: The market question/description
;; - deadline: When trading ends
;; - resolution-deadline: When creator must resolve by
;; - created-at: Block height when market was created
;; - active: Whether the market is currently active
(define-map markets
  uint
  {
    pool-contract: (optional principal),
    creator: principal,
    question: (string-utf8 256),
    deadline: uint,
    resolution-deadline: uint,
    created-at: uint,
    active: bool
  }
)

;; Creator Markets Map
;; Tracks which markets belong to each creator
;; Key: creator principal, Value: array of market IDs
(define-map creator-markets
  principal
  (list 100 uint)
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get the total number of markets created
(define-read-only (get-market-count)
  (ok (var-get market-count))
)

;; Get market details by market ID
(define-read-only (get-market (market-id uint))
  (match (map-get? markets market-id)
    market (ok market)
    (err ERR-MARKET-NOT-FOUND)
  )
)

;; Get all market IDs for a given creator
(define-read-only (get-creator-markets (creator principal))
  (ok (default-to (list) (map-get? creator-markets creator)))
)

;; Get minimum collateral requirement
(define-read-only (get-minimum-collateral)
  (ok MINIMUM-COLLATERAL)
)

;; Get default resolution window
(define-read-only (get-default-resolution-window)
  (ok DEFAULT-RESOLUTION-WINDOW)
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Create a new prediction market
;; Parameters:
;; - question: The market question (e.g., "Will Bitcoin reach $100k by 2025?")
;; - deadline: Block height when trading ends
;; - resolution-deadline: Block height by which creator must resolve (optional, uses default if none)
;; - collateral: Initial liquidity provided by creator (must be >= MINIMUM-COLLATERAL)
;; Returns: Market ID on success
(define-public (create-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline (optional uint))
    (collateral uint)
  )
  (let
    (
      (caller tx-sender)
      (current-count (var-get market-count))
      (next-market-id (+ current-count u1))
      (res-deadline (match resolution-deadline rd rd (+ deadline DEFAULT-RESOLUTION-WINDOW)))
    )
    ;; Validate inputs
    (asserts! (> (len question) u0) ERR-INVALID-QUESTION)
    (asserts! (> deadline block-height) ERR-INVALID-DEADLINE)
    (asserts! (> res-deadline deadline) ERR-INVALID-RESOLUTION-DEADLINE)
    (asserts! (>= collateral MINIMUM-COLLATERAL) ERR-INSUFFICIENT-COLLATERAL)

    ;; Transfer collateral from creator to contract
    ;; This acts as both initial liquidity and creator collateral
    (try! (contract-call? .mock-usdc transfer collateral caller (as-contract tx-sender) none))

    ;; Create market entry
    (map-set markets
      next-market-id
      {
        pool-contract: none,  ;; Will be set when pool is deployed
        creator: caller,
        question: question,
        deadline: deadline,
        resolution-deadline: res-deadline,
        created-at: block-height,
        active: true
      }
    )

    ;; Add market ID to creator's list
    (let
      (
        (current-markets (default-to (list) (map-get? creator-markets caller)))
        (updated-markets (unwrap! (as-max-len? (append current-markets next-market-id) u100) ERR-ZERO-AMOUNT))
      )
      (map-set creator-markets caller updated-markets)
    )

    ;; Increment market count
    (var-set market-count next-market-id)

    (print
      {
        event: "market-created",
        market-id: next-market-id,
        creator: caller,
        question: question,
        deadline: deadline,
        resolution-deadline: res-deadline,
        collateral: collateral
      }
    )

    (ok next-market-id)
  )
)

;; Deactivate a market (admin function)
;; Only the contract owner can deactivate markets
;; This prevents new trades but doesn't affect existing positions
(define-public (deactivate-market (market-id uint))
  (let
    (
      (caller contract-caller)
      (market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (get active market) ERR-MARKET-ALREADY-INACTIVE)

    ;; Update market to inactive
    (map-set markets
      market-id
      (merge market { active: false })
    )

    (print
      {
        event: "market-deactivated",
        market-id: market-id,
        deactivated-by: caller
      }
    )

    (ok true)
  )
)

;; Update pool contract address
;; Called by the deployed market-pool contract to register its address
;; This allows the factory to track which contract corresponds to each market
(define-public (update-pool-contract (market-id uint) (pool-principal principal))
  (let
    (
      (caller contract-caller)
      (market (unwrap! (map-get? markets market-id) ERR-MARKET-NOT-FOUND))
    )
    ;; Only allow the market-pool contract to update its own address
    ;; Or the contract owner
    (asserts!
      (or
        (is-eq caller CONTRACT-OWNER)
        (is-eq caller (unwrap! (get pool-contract market) ERR-MARKET-NOT-FOUND))
      )
      ERR-NOT-AUTHORIZED
    )

    ;; Update the pool contract address
    (map-set markets
      market-id
      (merge market { pool-contract: (some pool-principal) })
    )

    (print
      {
        event: "pool-contract-updated",
        market-id: market-id,
        pool-principal: pool-principal
      }
    )

    (ok true)
  )
)
