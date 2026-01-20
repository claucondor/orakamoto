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

    ;; Get market metadata including creator, description, status, resolution time, etc.
    ;; Returns: market info tuple with relevant market details
    (get-market-info () (response
      {
        creator: principal,
        resolver: principal,
        token: principal,
        description: (string-utf8 256),
        resolution-time: uint,
        resolved: bool,
        winning-outcome: (optional uint),
        total-liquidity: uint,
        created-at: uint
      }
      uint))

    ;; Get current prices for all outcomes
    ;; Prices are expressed in PRECISION units (1000000 = 1.0)
    ;; Returns: tuple with prices for outcome-yes and outcome-no
    (get-prices () (response
      {
        price-yes: uint,
        price-no: uint
      }
      uint))

    ;; Get current reserves for all outcomes in the AMM pool
    ;; Returns: tuple with reserve amounts for each outcome
    (get-reserves () (response
      {
        reserve-yes: uint,
        reserve-no: uint
      }
      uint))

    ;; ============================================
    ;; LIQUIDITY FUNCTIONS
    ;; ============================================

    ;; Add liquidity to the market pool
    ;; amount: Amount of collateral tokens to add as liquidity
    ;; Returns: Amount of LP tokens minted
    (add-liquidity (uint) (response uint uint))

    ;; Remove liquidity from the market pool
    ;; lp-amount: Amount of LP tokens to burn
    ;; Returns: Amount of collateral tokens returned
    (remove-liquidity (uint) (response uint uint))

    ;; ============================================
    ;; TRADING FUNCTIONS
    ;; ============================================

    ;; Buy outcome tokens
    ;; outcome: The outcome to buy (0 = No, 1 = Yes)
    ;; amount: Amount of collateral to spend
    ;; Returns: Amount of outcome tokens received
    (buy-outcome (uint uint) (response uint uint))

    ;; Sell outcome tokens
    ;; outcome: The outcome to sell (0 = No, 1 = Yes)
    ;; amount: Amount of outcome tokens to sell
    ;; Returns: Amount of collateral received
    (sell-outcome (uint uint) (response uint uint))

    ;; ============================================
    ;; RESOLUTION FUNCTIONS
    ;; ============================================

    ;; Resolve the market with the winning outcome
    ;; Only callable by authorized resolver after resolution time
    ;; outcome: The winning outcome (0 = No, 1 = Yes)
    ;; Returns: true on success
    (resolve (uint) (response bool uint))

    ;; Claim winnings after market resolution
    ;; Caller receives collateral for their winning outcome tokens
    ;; Returns: Amount of collateral claimed
    (claim () (response uint uint))
  )
)
