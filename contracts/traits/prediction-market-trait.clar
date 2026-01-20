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
        question: (string-utf8 256),
        creator: principal,
        deadline: uint,
        resolution-deadline: uint,
        is-resolved: bool,
        winning-outcome: (optional uint)
      }
      uint))

    ;; Get current prices for all outcomes
    ;; Prices are expressed in PRECISION units (1000000 = 1.0)
    ;; Returns: tuple with prices for yes and no outcomes
    (get-prices () (response
      {
        yes-price: uint,
        no-price: uint
      }
      uint))

    ;; Get current reserves for all outcomes in the AMM pool
    ;; Returns: tuple with reserve amounts for each outcome
    (get-reserves () (response
      {
        yes-reserve: uint,
        no-reserve: uint
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
    ;; Returns: Tuple with USDC returned and fee share
    (remove-liquidity (uint) (response { usdc-returned: uint, fee-share: uint } uint))

    ;; ============================================
    ;; TRADING FUNCTIONS
    ;; ============================================

    ;; Buy outcome tokens
    ;; outcome: The outcome to buy (1 = Yes, 2 = No)
    ;; amount: Amount of collateral to spend
    ;; min-tokens-out: Minimum tokens to receive (slippage protection)
    ;; Returns: Amount of outcome tokens received
    (buy-outcome (uint uint uint) (response uint uint))

    ;; Sell outcome tokens
    ;; outcome: The outcome to sell (1 = Yes, 2 = No)
    ;; amount: Amount of outcome tokens to sell
    ;; min-usdc-out: Minimum USDC to receive (slippage protection)
    ;; Returns: Amount of collateral received
    (sell-outcome (uint uint uint) (response uint uint))

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
