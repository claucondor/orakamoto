;; Oracle Trait Definition for StackPredict Protocol
;; Defines the interface for oracle price feeds used in auto-resolution markets
;;
;; This trait allows the protocol to integrate with different oracle providers:
;; - Mock Oracle (for devnet/testing)
;; - Pyth Oracle (for testnet/mainnet)
;; - RedStone Oracle (for testnet/mainnet)
;;
;; Price format: 8 decimals precision (standard oracle format)
;; Example: $50,000 BTC = 5000000000 (50,000 * 10^8)

(define-trait oracle-trait
  (
    ;; Get the current price for a given asset
    ;; asset: Asset identifier (e.g., "BTC", "STX", "ETH", "USDC")
    ;; Returns: Price with 8 decimals, or error code
    ;; Example: BTC at $50,000 returns (ok 5000000000)
    (get-price ((string-ascii 32)) (response uint uint))

    ;; Check if price is fresh (not stale)
    ;; asset: Asset identifier
    ;; max-age: Maximum allowed age in blocks or seconds
    ;; Returns: true if price is fresh, false if stale
    (is-price-fresh ((string-ascii 32) uint) (response bool uint))
  )
)
