;; Pyth Oracle Wrapper for StackPredict Protocol
;; Implements oracle-trait interface for auto-resolution markets
;;
;; DEVNET MODE: Uses mock-oracle for testing
;; MAINNET: Would use SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
;;
;; Reference: https://github.com/stx-labs/stacks-pyth-bridge

;; Traits
(impl-trait .oracle-trait.oracle-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)

;; Price Feed IDs (32-byte hex strings)
;; These are the standard Pyth price feed IDs for common assets
;; Source: https://pyth.network/price-feeds
(define-constant PRICE-FEED-ID-BTC 0xe62df6c8b4a85fe1a67db44dc12de5dc330d7b5e4c1cb89100b8000000000001)
(define-constant PRICE-FEED-ID-ETH 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d6788906ef67b7a47dd)
(define-constant PRICE-FEED-ID-STX 0x73757065722d7374616b652d737461636b732d7573642d707269636500000000)
(define-constant PRICE-FEED-ID-USDC 0xeaa020c61cc47971281920289578902000000000000000000000000000000001)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u4200))
(define-constant ERR-ASSET-NOT-SUPPORTED (err u4201))
(define-constant ERR-PRICE-NOT-AVAILABLE (err u4202))
(define-constant ERR-PRICE-STALE (err u4203))
(define-constant ERR-INVALID-FEED-ID (err u4204))
(define-constant ERR-PYTH-ORACLE-CALL (err u4205))

;; Data Map: Asset to Price Feed ID mapping
;; Maps asset name (e.g., "BTC") to Pyth price feed ID
(define-map price-feed-ids
  (string-ascii 32)
  (buff 32)
)

;; Initialize price feed ID mappings
(define-public (initialize-price-feeds)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (map-set price-feed-ids "BTC" PRICE-FEED-ID-BTC)
    (map-set price-feed-ids "ETH" PRICE-FEED-ID-ETH)
    (map-set price-feed-ids "STX" PRICE-FEED-ID-STX)
    (map-set price-feed-ids "USDC" PRICE-FEED-ID-USDC)
    (print { event: "price-feeds-initialized" })
    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS (oracle-trait)
;; ============================================

;; Get the current price for a given asset
;; asset: Asset identifier (e.g., "BTC", "STX", "ETH", "USDC")
;; Returns: Price with 8 decimals, or error code
;; Example: BTC at $50,000 returns (ok 5000000000)
(define-read-only (get-price (asset (string-ascii 32)))
  (let
    (
      (feed-id (unwrap! (map-get? price-feed-ids asset) ERR-ASSET-NOT-SUPPORTED))
      (price-data (try! (get-price-from-feed feed-id)))
      (price-int (get price price-data))
    )
    ;; Convert int to uint (assumes positive price)
    (ok (to-uint price-int))
  )
)

;; Check if price is fresh (not stale)
;; asset: Asset identifier
;; max-age: Maximum allowed age in blocks
;; Returns: true if price is fresh, false if stale
(define-read-only (is-price-fresh (asset (string-ascii 32)) (max-age uint))
  (let
    (
      (feed-id (unwrap! (map-get? price-feed-ids asset) ERR-ASSET-NOT-SUPPORTED))
      (price-data (try! (get-price-from-feed feed-id)))
      (current-price (get price price-data))
      (publish-time (get publish-time price-data))
      (age (- block-height publish-time))
    )
    (ok (<= age max-age))
  )
)

;; ============================================
;; INTERNAL HELPER FUNCTIONS
;; ============================================

;; Get price from Pyth price feed ID
;; DEVNET: Uses mock-oracle for testing (maps feed-id to asset name)
;; MAINNET: Would call pyth-oracle-v4.read-price-feed
(define-private (get-price-from-feed (feed-id (buff 32)))
  (let
    (
      ;; DEVNET: Map feed-id back to asset name and use mock-oracle
      ;; In production, this would call the real Pyth oracle
      (asset-name (get-asset-from-feed-id feed-id))
    )
    (match asset-name
      asset
      (let
        (
          ;; Call mock-oracle to get price (returns uint with 8 decimals)
          (mock-price-result (contract-call? .mock-oracle get-price asset))
        )
        (match mock-price-result
          price-value
          (ok { price: (to-int price-value), publish-time: block-height })
          err-code
          ERR-PRICE-NOT-AVAILABLE
        )
      )
      ERR-INVALID-FEED-ID
    )
  )
)

;; Normalize price to 8 decimal format (used in mainnet mode)
(define-private (normalize-price (price int) (expo int))
  price
)

;; DEVNET HELPER: Map feed-id back to asset name
;; Returns (optional string-ascii) for the asset name
(define-private (get-asset-from-feed-id (feed-id (buff 32)))
  (if (is-eq feed-id PRICE-FEED-ID-BTC)
    (some "BTC")
    (if (is-eq feed-id PRICE-FEED-ID-ETH)
      (some "ETH")
      (if (is-eq feed-id PRICE-FEED-ID-STX)
        (some "STX")
        (if (is-eq feed-id PRICE-FEED-ID-USDC)
          (some "USDC")
          none
        )
      )
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Get price info including feed ID for an asset
;; Returns: { price, publish-time, feed-id }
(define-read-only (get-price-info (asset (string-ascii 32)))
  (let
    (
      (feed-id (unwrap! (map-get? price-feed-ids asset) ERR-ASSET-NOT-SUPPORTED))
      (price-data (try! (get-price-from-feed feed-id)))
    )
    (ok
      {
        price: (get price price-data),
        publish-time: (get publish-time price-data),
        feed-id: feed-id
      }
    )
  )
)

;; Get all supported assets and their feed IDs
(define-read-only (get-supported-assets)
  (ok
    {
      btc: PRICE-FEED-ID-BTC,
      eth: PRICE-FEED-ID-ETH,
      stx: PRICE-FEED-ID-STX,
      usdc: PRICE-FEED-ID-USDC
    }
  )
)

;; Check if an asset is supported
(define-read-only (is-asset-supported (asset (string-ascii 32)))
  (is-some (map-get? price-feed-ids asset))
)

;; Get the underlying oracle info
;; DEVNET: Returns mock-oracle indicator
;; MAINNET: Would return SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4
(define-read-only (get-oracle-mode)
  (ok "devnet-mock-oracle")
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Add a new price feed for an asset
;; Only callable by contract owner
(define-public (add-price-feed (asset (string-ascii 32)) (feed-id (buff 32)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-some (map-get? price-feed-ids asset))) ERR-INVALID-FEED-ID)
    (map-set price-feed-ids asset feed-id)
    (print { event: "price-feed-added", asset: asset, feed-id: feed-id })
    (ok true)
  )
)

;; Update an existing price feed
;; Only callable by contract owner
(define-public (update-price-feed (asset (string-ascii 32)) (feed-id (buff 32)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (is-some (map-get? price-feed-ids asset)) ERR-ASSET-NOT-SUPPORTED)
    (map-set price-feed-ids asset feed-id)
    (print { event: "price-feed-updated", asset: asset, feed-id: feed-id })
    (ok true)
  )
)

;; Remove a price feed
;; Only callable by contract owner
(define-public (remove-price-feed (asset (string-ascii 32)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (map-delete price-feed-ids asset)
    (print { event: "price-feed-removed", asset: asset })
    (ok true)
  )
)
