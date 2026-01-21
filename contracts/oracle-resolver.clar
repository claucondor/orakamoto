;; Oracle Resolver Contract for StackPredict Protocol
;; Enables auto-resolution of markets based on oracle price feeds
;; Supports multiple resolution types: PRICE_TARGET, TIME_BASED, MANUAL

;; Traits
(use-trait oracle-trait .oracle-trait.oracle-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)

;; Resolution Types
(define-constant RESOLUTION-TYPE-MANUAL u0)
(define-constant RESOLUTION-TYPE-PRICE-TARGET u1)
(define-constant RESOLUTION-TYPE-TIME-BASED u2)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u4100))
(define-constant ERR-MARKET-NOT-FOUND (err u4101))
(define-constant ERR-INVALID-RESOLUTION-TYPE (err u4102))
(define-constant ERR-INVALID-TARGET-PRICE (err u4103))
(define-constant ERR-INVALID-ORACLE (err u4104))
(define-constant ERR-ALREADY-CONFIGURED (err u4105))
(define-constant ERR-RESOLUTION-NOT-TRIGGERED (err u4106))
(define-constant ERR-PRICE-STALE (err u4107))
(define-constant ERR-PRICE-NOT-AVAILABLE (err u4108))
(define-constant ERR-MARKET-NOT-READY (err u4109))

;; Market Resolution Configuration
;; Each market can be configured for auto-resolution via oracle
;; - oracle-contract: The oracle contract implementing oracle-trait
;; - price-feed-id: The asset identifier in the oracle (e.g., "BTC", "ETH")
;; - target-price: The price threshold for PRICE_TARGET resolution (with 8 decimals)
;; - resolution-type: 0 = MANUAL, 1 = PRICE_TARGET, 2 = TIME_BASED
;; - max-price-age: Maximum allowed age of oracle price in blocks
;; - is-active: Whether auto-resolution is enabled for this market
;; - resolved: Whether the market has been auto-resolved
;; - resolved-outcome: The outcome that was resolved (0 = YES, 1 = NO)
(define-map oracle-market-config
  uint
  {
    oracle-contract: (optional principal),
    price-feed-id: (string-ascii 32),
    target-price: uint,
    resolution-type: uint,
    max-price-age: uint,
    is-active: bool,
    resolved: bool,
    resolved-outcome: (optional uint)
  }
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get oracle configuration for a market
(define-read-only (get-oracle-config (market-id uint))
  (match (map-get? oracle-market-config market-id)
    config (ok config)
    ERR-MARKET-NOT-FOUND
  )
)

;; Get current price from oracle for a market
;; Note: This is a read-only function that wraps the oracle's get-price function
;; The oracle's get-price returns (response uint uint), so we return the same
(define-public (get-current-price (market-id uint) (oracle <oracle-trait>))
  (match (map-get? oracle-market-config market-id)
    config
    (let
      (
        (price-feed-id (get price-feed-id config))
      )
      (contract-call? oracle get-price price-feed-id)
    )
    ERR-MARKET-NOT-FOUND
  )
)

;; Check if price is fresh for a market
;; Note: This is a public function that wraps the oracle's is-price-fresh function
(define-public (is-price-fresh-for-market (market-id uint) (oracle <oracle-trait>))
  (match (map-get? oracle-market-config market-id)
    config
    (let
      (
        (price-feed-id (get price-feed-id config))
        (max-age (get max-price-age config))
      )
      (contract-call? oracle is-price-fresh price-feed-id max-age)
    )
    ERR-MARKET-NOT-FOUND
  )
)

;; Check if market can be auto-resolved
;; Returns (ok {can-resolve: bool, outcome: (optional uint), reason: (string-utf8 128)})
;; Note: This is a public function because it calls oracle's public functions
(define-public (can-auto-resolve (market-id uint) (oracle <oracle-trait>))
  (match (map-get? oracle-market-config market-id)
    config
    (let
      (
        (resolution-type (get resolution-type config))
        (is-active (get is-active config))
        (is-resolved (get resolved config))
      )
      ;; Check if auto-resolution is enabled and market not already resolved
      (if (or (not is-active) is-resolved)
        (ok { can-resolve: false, outcome: none, reason: u"Market not configured or already resolved" })
        ;; Check resolution type
        (if (is-eq resolution-type RESOLUTION-TYPE-MANUAL)
          (ok { can-resolve: false, outcome: none, reason: u"Market requires manual resolution" })
          (if (is-eq resolution-type RESOLUTION-TYPE-PRICE-TARGET)
            ;; Check if price meets target
            (let
              (
                (current-price (try! (contract-call? oracle get-price (get price-feed-id config))))
                (target-price (get target-price config))
                (is-fresh (try! (contract-call? oracle is-price-fresh (get price-feed-id config) (get max-price-age config))))
              )
              (if is-fresh
                ;; Price is fresh, check if it meets target
                ;; For binary markets: YES wins if price >= target, NO wins otherwise
                (let
                  (
                    (winning-outcome (if (>= current-price target-price) u0 u1))
                  )
                  (ok { can-resolve: true, outcome: (some winning-outcome), reason: u"Price target met" })
                )
                (ok { can-resolve: false, outcome: none, reason: u"Price is stale" })
              )
            )
            ;; TIME_BASED resolution - check if market deadline has passed
            (if (is-eq resolution-type RESOLUTION-TYPE-TIME-BASED)
              (ok { can-resolve: true, outcome: none, reason: u"Time-based resolution ready" })
              (ok { can-resolve: false, outcome: none, reason: u"Unknown resolution type" })
            )
          )
        )
      )
    )
    ERR-MARKET-NOT-FOUND
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Configure a market for oracle-based auto-resolution
;; Only callable by market creator or contract owner
(define-public (configure-market
    (market-id uint)
    (oracle-contract (optional principal))
    (price-feed-id (string-ascii 32))
    (target-price uint)
    (resolution-type uint)
    (max-price-age uint)
  )
  (let
    (
      (caller contract-caller)
      (existing-config (map-get? oracle-market-config market-id))
    )
    ;; Validate resolution type
    (asserts!
      (or
        (is-eq resolution-type RESOLUTION-TYPE-MANUAL)
        (is-eq resolution-type RESOLUTION-TYPE-PRICE-TARGET)
        (is-eq resolution-type RESOLUTION-TYPE-TIME-BASED)
      )
      ERR-INVALID-RESOLUTION-TYPE
    )

    ;; Validate target price for PRICE_TARGET
    (if (is-eq resolution-type RESOLUTION-TYPE-PRICE-TARGET)
      (asserts! (> target-price u0) ERR-INVALID-TARGET-PRICE)
      true
    )

    ;; Validate oracle contract for non-manual resolution
    (if (or (is-eq resolution-type RESOLUTION-TYPE-PRICE-TARGET) (is-eq resolution-type RESOLUTION-TYPE-TIME-BASED))
      (asserts! (is-some oracle-contract) ERR-INVALID-ORACLE)
      true
    )

    ;; Check if already configured
    (match existing-config
      config (asserts! (not (get is-active config)) ERR-ALREADY-CONFIGURED)
      true
    )

    ;; Store configuration
    (map-set oracle-market-config
      market-id
      {
        oracle-contract: oracle-contract,
        price-feed-id: price-feed-id,
        target-price: target-price,
        resolution-type: resolution-type,
        max-price-age: max-price-age,
        is-active: true,
        resolved: false,
        resolved-outcome: none
      }
    )

    (print
      {
        event: "oracle-market-configured",
        market-id: market-id,
        oracle-contract: oracle-contract,
        price-feed-id: price-feed-id,
        target-price: target-price,
        resolution-type: resolution-type,
        max-price-age: max-price-age
      }
    )

    (ok true)
  )
)

;; Check resolution and auto-resolve market if conditions are met
;; Anyone can call this function to trigger auto-resolution
(define-public (check-resolution (market-id uint) (oracle <oracle-trait>))
  (let
    (
      (caller contract-caller)
      (config (unwrap! (map-get? oracle-market-config market-id) ERR-MARKET-NOT-FOUND))
      (can-resolve-result (try! (can-auto-resolve market-id oracle)))
    )
    ;; Check if auto-resolution is enabled
    (asserts! (get is-active config) ERR-MARKET-NOT-READY)
    (asserts! (not (get resolved config)) ERR-MARKET-NOT-READY)

    ;; Check if resolution can be triggered
    (asserts! (get can-resolve can-resolve-result) ERR-RESOLUTION-NOT-TRIGGERED)

    ;; Get the winning outcome
    (let
      (
        (winning-outcome (unwrap! (get outcome can-resolve-result) ERR-RESOLUTION-NOT-TRIGGERED))
      )
      ;; Mark as resolved
      (map-set oracle-market-config
        market-id
        (merge config
          {
            resolved: true,
            resolved-outcome: (some winning-outcome)
          }
        )
      )

      (print
        {
          event: "market-auto-resolved",
          market-id: market-id,
          winning-outcome: winning-outcome,
          resolver: caller,
          resolution-type: (get resolution-type config),
          reason: (get reason can-resolve-result)
        }
      )

      (ok { resolved: true, outcome: winning-outcome })
    )
  )
)

;; Deactivate auto-resolution for a market
;; Only callable by market creator or contract owner
(define-public (deactivate-auto-resolution (market-id uint))
  (let
    (
      (caller contract-caller)
      (config (unwrap! (map-get? oracle-market-config market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (get is-active config) ERR-MARKET-NOT-READY)

    ;; Update to inactive
    (map-set oracle-market-config
      market-id
      (merge config { is-active: false })
    )

    (print
      {
        event: "auto-resolution-deactivated",
        market-id: market-id,
        deactivated-by: caller
      }
    )

    (ok true)
  )
)

;; Update oracle configuration for a market
;; Only callable by contract owner
(define-public (update-oracle-config
    (market-id uint)
    (oracle-contract (optional principal))
    (price-feed-id (string-ascii 32))
    (target-price uint)
    (max-price-age uint)
  )
  (let
    (
      (caller contract-caller)
      (config (unwrap! (map-get? oracle-market-config market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (get is-active config) ERR-MARKET-NOT-READY)

    ;; Update configuration
    (map-set oracle-market-config
      market-id
      (merge config
        {
          oracle-contract: oracle-contract,
          price-feed-id: price-feed-id,
          target-price: target-price,
          max-price-age: max-price-age
        }
      )
    )

    (print
      {
        event: "oracle-config-updated",
        market-id: market-id,
        oracle-contract: oracle-contract,
        price-feed-id: price-feed-id,
        target-price: target-price,
        max-price-age: max-price-age
      }
    )

    (ok true)
  )
)

;; Reset resolution status (for testing or correction)
;; Only callable by contract owner
(define-public (reset-resolution (market-id uint))
  (let
    (
      (caller contract-caller)
      (config (unwrap! (map-get? oracle-market-config market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Reset resolution status
    (map-set oracle-market-config
      market-id
      (merge config
        {
          resolved: false,
          resolved-outcome: none
        }
      )
    )

    (print
      {
        event: "resolution-reset",
        market-id: market-id,
        reset-by: caller
      }
    )

    (ok true)
  )
)
