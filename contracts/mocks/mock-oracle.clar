;; Mock Oracle for StackPredict Protocol (Devnet)
;; Implements oracle-trait for testing auto-resolution markets
;; Allows admin to manually set prices for testing different scenarios

;; Traits
(impl-trait .oracle-trait.oracle-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-PRICE-AGE u1008)  ;; ~7 days in blocks for testing

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u400))
(define-constant ERR-ASSET-NOT-FOUND (err u401))
(define-constant ERR-ZERO-PRICE (err u402))
(define-constant ERR-PRICE-STALE (err u403))

;; Data map: asset -> { price, timestamp }
;; Price has 8 decimals (standard oracle format)
;; Timestamp is block height when price was set
(define-map prices
  (string-ascii 32)
  { price: uint, timestamp: uint }
)

;; Get the current price for a given asset
;; Returns price with 8 decimals
(define-read-only (get-price (asset (string-ascii 32)))
  (match (map-get? prices asset)
    price-data (ok (get price price-data))
    ERR-ASSET-NOT-FOUND
  )
)

;; Check if price is fresh (not stale)
;; Returns true if price was updated within max-age blocks
(define-read-only (is-price-fresh (asset (string-ascii 32)) (max-age uint))
  (match (map-get? prices asset)
    price-data
    (let
      (
        (price-timestamp (get timestamp price-data))
        (age (- block-height price-timestamp))
      )
      (ok (<= age max-age))
    )
    ERR-ASSET-NOT-FOUND
  )
)

;; Admin: Set price for an asset
;; Only callable by contract owner
;; Price should be provided with 8 decimals (e.g., 5000000000 for $50,000)
(define-public (set-price (asset (string-ascii 32)) (price uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> price u0) ERR-ZERO-PRICE)
    (map-set prices asset { price: price, timestamp: block-height })
    (print { event: "price-updated", asset: asset, price: price, timestamp: block-height })
    (ok true)
  )
)

;; Admin: Set multiple prices at once
;; Useful for initializing multiple assets
(define-public (set-prices (prices-list (list 10 { asset: (string-ascii 32), price: uint })))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (fold set-price-iter prices-list true)
    (ok true)
  )
)

;; Helper function for folding over prices list
(define-private (set-price-iter (entry { asset: (string-ascii 32), price: uint }) (acc bool))
  (begin
    (map-set prices (get asset entry) { price: (get price entry), timestamp: block-height })
    true
  )
)

;; Admin: Remove an asset from the oracle
(define-public (remove-price (asset (string-ascii 32)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (map-delete prices asset)
    (print { event: "price-removed", asset: asset })
    (ok true)
  )
)

;; Read-only: Get price info for an asset (price + timestamp)
(define-read-only (get-price-info (asset (string-ascii 32)))
  (match (map-get? prices asset)
    price-data (ok price-data)
    ERR-ASSET-NOT-FOUND
  )
)

;; Read-only: Check if price is stale
(define-read-only (is-price-stale (asset (string-ascii 32)))
  (match (map-get? prices asset)
    price-data
    (let
      (
        (price-timestamp (get timestamp price-data))
        (age (- block-height price-timestamp))
      )
      (ok (> age MAX-PRICE-AGE))
    )
    ERR-ASSET-NOT-FOUND
  )
)
