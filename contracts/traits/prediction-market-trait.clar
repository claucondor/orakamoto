;; prediction-market-trait.clar
;; Interface for prediction markets on StackPredict Protocol
;;
;; This trait defines the standard interface for binary prediction markets.
;; Markets implementing this trait support liquidity provision, outcome trading,
;; and resolution/claim mechanics.

(define-trait prediction-market-trait
  (
    ;; ============================================
    ;; READ-ONLY FUNCTIONS
    ;; ============================================

    (get-market-info (uint) (response
      {
        question: (string-utf8 256),
        creator: principal,
        deadline: uint,
        resolution-deadline: uint,
        is-resolved: bool,
        winning-outcome: (optional uint)
      }
      uint))

    (get-prices (uint) (response
      {
        yes-price: uint,
        no-price: uint
      }
      uint))

    (get-reserves (uint) (response
      {
        yes-reserve: uint,
        no-reserve: uint
      }
      uint))

    ;; ============================================
    ;; LIQUIDITY FUNCTIONS
    ;; ============================================

    (add-liquidity (uint uint) (response uint uint))
    (remove-liquidity (uint uint) (response { usdc-returned: uint, fee-share: uint } uint))

    ;; ============================================
    ;; TRADING FUNCTIONS
    ;; ============================================

    (buy-outcome (uint uint uint uint) (response uint uint))
    (sell-outcome (uint uint uint uint) (response uint uint))

    ;; ============================================
    ;; RESOLUTION FUNCTIONS
    ;; ============================================

    (resolve (uint uint) (response bool uint))
    (claim (uint) (response uint uint))
  )
)
