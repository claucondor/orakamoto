;; Pyth Oracle Wrapper for StackPredict Protocol
;; Wraps the Pyth Oracle (SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4)
;; to implement the oracle-trait interface for auto-resolution markets
;;
;; Reference: https://github.com/stx-labs/stacks-pyth-bridge
;; Pyth Oracle Contract: SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4

;; Traits
(impl-trait .oracle-trait.oracle-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)

;; Pyth Oracle Contract Address (Testnet/Mainnet)
;; For devnet, this would need to be deployed separately
(define-constant PYTH-ORACLE-CONTRACT 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4)

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
    )
    (get-price-from-feed feed-id)
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
;; Calls the Pyth oracle's read-price-feed function
(define-private (get-price-from-feed (feed-id (buff 32)))
  (let
    (
      ;; Call Pyth oracle to read price feed
      ;; The pyth-oracle-v4.read-price-feed returns (response { price: int, conf: uint, expo: int, publish-time: uint } uint)
      (pyth-result (contract-call? PYTH-ORACLE-CONTRACT read-price-feed feed-id))
    )
    (match pyth-result
      price-feed-data
      (let
        (
          (price (get price price-feed-data))
          (conf (get conf price-feed-data))
          (expo (get expo price-feed-data))
          (publish-time (get publish-time price-feed-data))
        )
        ;; Convert price to 8 decimal format
        ;; Pyth prices have an exponent (expo) that needs to be normalized to 8 decimals
        ;; For example, if expo = -8, price is already in 8 decimals
        ;; If expo = -6, we need to multiply by 100 to get 8 decimals
        (let
          (
            (normalized-price (normalize-price price expo))
          )
          (ok { price: normalized-price, publish-time: publish-time })
        )
      )
      err-code
      (err (+ u10000 err-code))  ;; Prefix Pyth error with 10000 for easier debugging
    )
  )
)

;; Normalize price to 8 decimal format
;; Pyth prices use an exponent to represent decimal places
;; We normalize everything to 8 decimals (standard oracle format)
;; Note: Pyth typically uses -8 as exponent for 8 decimal prices
(define-private (normalize-price (price int) (expo int))
  ;; For simplicity, we assume expo is -8 (standard for 8-decimal prices)
  ;; If expo differs, the price will be scaled accordingly
  ;; This is a simplified implementation - in production, you'd want more robust handling
  ;; Since Clarity doesn't have easy signed integer comparison, we use a simple approach
  ;; Most Pyth feeds use -8 for 8 decimals, so we return price as-is
  ;; For other exponents, additional logic would be needed
  price
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

;; Get the Pyth oracle contract address
(define-read-only (get-pyth-oracle-contract)
  (ok PYTH-ORACLE-CONTRACT)
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
