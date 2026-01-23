;; ============================================================================
;; @deprecated DEPRECATED - DO NOT USE IN NEW DEVELOPMENT
;; ============================================================================
;;
;; REPLACED BY: market-factory-v3.clar
;; REASON: V1 factory creates markets in singleton market-pool (deprecated)
;;
;; MIGRATION GUIDE:
;; - Old: factory.create-market() -> deploys to singleton market-pool.clar
;; - New: factory-v3.create-market() -> creates market-id in multi-market-pool
;;
;; KEY DIFFERENCES:
;; - This (V1): Creates markets for deprecated market-pool.clar
;; - V2: Same as V1, just lower minimum collateral (1 USDC vs 50 USDC)
;; - V3: Creates markets in multi-market-pool with metadata (categories, tags)
;;
;; WHY DEPRECATED:
;; 1. Points to deprecated market-pool.clar (singleton model)
;; 2. No metadata support (no categories, tags, featured)
;; 3. 50 USDC minimum collateral too high for testing
;;
;; This contract is kept for:
;; - Historical reference
;; - Existing test coverage validation
;; - Understanding the evolution of the protocol
;;
;; ============================================================================

;; Market Factory Contract
;; Creates and manages prediction market pools on StackPredict Protocol

;; Constants
(define-constant MINIMUM-COLLATERAL u50000000)     ;; 50 USDC (6 decimals)
(define-constant DEFAULT-RESOLUTION-WINDOW u1008)  ;; ~7 days in blocks (144 blocks/day * 7)
(define-constant CONTRACT-OWNER tx-sender)

;; Token Contract Configuration
;; IMPORTANT: Change this before deployment to testnet/mainnet
;; Simnet/Devnet: .mock-usdc
;; Testnet: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
;; Mainnet: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
(define-constant TOKEN-CONTRACT 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)

;; Constants for Multi-Outcome Markets
(define-constant MAX-OUTCOMES u10)
(define-constant MIN-OUTCOMES u2)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u2000))
(define-constant ERR-INVALID-QUESTION (err u2001))
(define-constant ERR-INVALID-DEADLINE (err u2002))
(define-constant ERR-INVALID-RESOLUTION-DEADLINE (err u2003))
(define-constant ERR-INSUFFICIENT-COLLATERAL (err u2004))
(define-constant ERR-MARKET-NOT-FOUND (err u2005))
(define-constant ERR-MARKET-ALREADY-INACTIVE (err u2007))
(define-constant ERR-ZERO-AMOUNT (err u2008))
(define-constant ERR-INVALID-OUTCOME-COUNT (err u2009))
(define-constant ERR-INVALID-OUTCOME-LABELS (err u2010))
(define-constant ERR-INVALID-LMSR-B (err u2011))

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
;; - market-type: "binary" or "multi-outcome"
;; - outcome-count: Number of outcomes (2 for binary, 2-10 for multi-outcome)
;; - outcome-labels: List of labels for each outcome (e.g., "Yes", "No", "Tie")
;; - lmsr-b: LMSR liquidity parameter (only for multi-outcome markets)
(define-map markets
  uint
  {
    pool-contract: (optional principal),
    creator: principal,
    question: (string-utf8 256),
    deadline: uint,
    resolution-deadline: uint,
    created-at: uint,
    active: bool,
    market-type: (string-utf8 16),
    outcome-count: uint,
    outcome-labels: (list 10 (string-utf8 32)),
    lmsr-b: uint
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

;; Create a new binary prediction market (YES/NO)
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
    (try! (contract-call? .usdcx transfer collateral caller (as-contract tx-sender) none))

    ;; Create market entry for binary market
    (map-set markets
      next-market-id
      {
        pool-contract: none,  ;; Will be set when pool is deployed
        creator: caller,
        question: question,
        deadline: deadline,
        resolution-deadline: res-deadline,
        created-at: block-height,
        active: true,
        market-type: u"binary",
        outcome-count: u2,
        outcome-labels: (list u"Yes" u"No" u"" u"" u"" u"" u"" u"" u"" u""),
        lmsr-b: u0
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
        collateral: collateral,
        market-type: u"binary"
      }
    )

    (ok next-market-id)
  )
)

;; Create a new multi-outcome prediction market using LMSR
;; Parameters:
;; - question: The market question (e.g., "Who will win the 2024 election?")
;; - deadline: Block height when trading ends
;; - resolution-deadline: Block height by which creator must resolve (optional, uses default if none)
;; - collateral: Initial liquidity provided by creator (must be >= MINIMUM-COLLATERAL)
;; - outcome-count: Number of outcomes (2-10)
;; - outcome-labels: List of labels for each outcome
;; - lmsr-b: LMSR liquidity parameter (higher = more liquid, less price impact)
;; Returns: Market ID on success
(define-public (create-multi-outcome-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline (optional uint))
    (collateral uint)
    (outcome-count uint)
    (outcome-labels (list 10 (string-utf8 32)))
    (lmsr-b uint)
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
    (asserts! (>= outcome-count MIN-OUTCOMES) ERR-INVALID-OUTCOME-COUNT)
    (asserts! (<= outcome-count MAX-OUTCOMES) ERR-INVALID-OUTCOME-COUNT)
    ;; Validate outcome labels match outcome count
    (asserts! (is-eq outcome-count (len outcome-labels)) ERR-INVALID-OUTCOME-LABELS)
    ;; Validate all labels that should be used are non-empty
    ;; Check first N labels based on outcome-count
    (asserts!
      (and
        ;; Always check first 2 outcomes
        (> (len (default-to u"" (element-at outcome-labels u0))) u0)
        (> (len (default-to u"" (element-at outcome-labels u1))) u0)
        ;; Check remaining outcomes based on count
        (if (>= outcome-count u3) (> (len (default-to u"" (element-at outcome-labels u2))) u0) true)
        (if (>= outcome-count u4) (> (len (default-to u"" (element-at outcome-labels u3))) u0) true)
        (if (>= outcome-count u5) (> (len (default-to u"" (element-at outcome-labels u4))) u0) true)
        (if (>= outcome-count u6) (> (len (default-to u"" (element-at outcome-labels u5))) u0) true)
        (if (>= outcome-count u7) (> (len (default-to u"" (element-at outcome-labels u6))) u0) true)
        (if (>= outcome-count u8) (> (len (default-to u"" (element-at outcome-labels u7))) u0) true)
        (if (>= outcome-count u9) (> (len (default-to u"" (element-at outcome-labels u8))) u0) true)
        (if (>= outcome-count u10) (> (len (default-to u"" (element-at outcome-labels u9))) u0) true)
      )
      ERR-INVALID-OUTCOME-LABELS
    )
    (asserts! (> lmsr-b u0) ERR-INVALID-LMSR-B)

    ;; Transfer collateral from creator to contract
    ;; This acts as both initial liquidity and creator collateral
    (try! (contract-call? .usdcx transfer collateral caller (as-contract tx-sender) none))

    ;; Create market entry for multi-outcome market
    (map-set markets
      next-market-id
      {
        pool-contract: none,  ;; Will be set when pool is deployed
        creator: caller,
        question: question,
        deadline: deadline,
        resolution-deadline: res-deadline,
        created-at: block-height,
        active: true,
        market-type: u"multi-outcome",
        outcome-count: outcome-count,
        outcome-labels: outcome-labels,
        lmsr-b: lmsr-b
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
        event: "multi-outcome-market-created",
        market-id: next-market-id,
        creator: caller,
        question: question,
        deadline: deadline,
        resolution-deadline: res-deadline,
        collateral: collateral,
        market-type: u"multi-outcome",
        outcome-count: outcome-count,
        outcome-labels: outcome-labels,
        lmsr-b: lmsr-b
      }
    )

    (ok next-market-id)
  )
)

;; Get market type (binary or multi-outcome)
(define-read-only (get-market-type (market-id uint))
  (match (map-get? markets market-id)
    market (ok (get market-type market))
    (err ERR-MARKET-NOT-FOUND)
  )
)

;; Get outcome labels for a market
(define-read-only (get-outcome-labels (market-id uint))
  (match (map-get? markets market-id)
    market (ok (get outcome-labels market))
    (err ERR-MARKET-NOT-FOUND)
  )
)

;; Get LMSR b parameter for a multi-outcome market
(define-read-only (get-lmsr-b (market-id uint))
  (match (map-get? markets market-id)
    market (ok (get lmsr-b market))
    (err ERR-MARKET-NOT-FOUND)
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
