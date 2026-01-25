;; pm-amm-core-v2.clar
;; Prediction Market AMM Core Library V2
;; Implements the pm-AMM algorithm from Paradigm Research
;; Reference: https://www.paradigm.xyz/2024/11/pm-amm
;;
;; V2 Changes:
;; - Fixed ArithmeticUnderflow in safe-int-add (now uses native Clarity arithmetic)
;;
;; This is a library contract, not a standalone market.
;; Uses 8-decimal fixed-point precision (ONE_8 = 100000000)
;; Includes inline fixed-point math functions from ALEX math-fixed-point.clar

;; ============================================================================
;; Constants
;; ============================================================================

(define-constant ONE_8 u100000000) ;; 8 decimal places

;; Normal Distribution Constants
;; 1/sqrt(2*pi) ~= 0.39894228
(define-constant INV_SQRT_2PI u39894228)

;; Abramowitz-Stegun coefficients for CDF approximation
;; Phi(z) ~= 1 - phi(z) * (b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5) where t = 1/(1 + p*z)
(define-constant AS_P u23164190)    ;; p = 0.2316419
(define-constant AS_B1 u31938153)   ;; b1 = 0.319381530
(define-constant AS_B2 u35656378)   ;; b2 = 0.356563782 (used as negative)
(define-constant AS_B3 u178147794)  ;; b3 = 1.781477937
(define-constant AS_B4 u182125598)  ;; b4 = 1.821255978 (used as negative)
(define-constant AS_B5 u133027443)  ;; b5 = 1.330274429

;; Error constants

;; ============================================================================
;; Fixed-Point Math Helpers (from ALEX math-fixed-point.clar)
;; ============================================================================

;; Helper function for fixed-point multiplication
(define-read-only (mul-down (a uint) (b uint))
    (/ (* a b) ONE_8)
)

;; Helper function for safe integer subtraction (prevents underflow)
;; Returns a - b, or handles underflow by computing -(b - a) when a < b
(define-private (safe-int-sub (a int) (b int))
    (if (>= a b)
        (- a b)
        (- 0 (- b a))  ;; Compute -(b - a) when a < b to avoid underflow
    )
)

;; Helper function for safe integer addition
;; Returns a + b as int (standard addition, no special handling needed in Clarity)
(define-private (safe-int-add (a int) (b int))
    (+ a b)
)

;; Helper function for fixed-point division
;; Returns 0 if either a = 0 or b = 0 (avoids division by zero)
(define-read-only (div-down (a uint) (b uint))
    (if (or (is-eq a u0) (is-eq b u0))
        u0
        (/ (* a ONE_8) b)
    )
)

;; ============================================================================
;; Normal Distribution Functions
;; ============================================================================

;; @doc Calculate the Probability Density Function (PDF) of standard normal distribution
;; @param z: Z-score in 8-decimal fixed point (e.g., 100000000 = 1.0)
;; @return: PDF value phi(z) in 8-decimal fixed point
;;
;; Formula: phi(z) = (1/sqrt(2*pi)) * e^(-z^2/2)
;; The PDF is symmetric: phi(z) = phi(-z)
;;
;; Uses Taylor series approximation for e^x: e^x ~= 1 + x + x^2/2! + x^3/3! + ...
(define-read-only (normal-pdf (z int))
    (let (
            ;; Square z: z^2 (always positive, convert to uint)
            (z-abs (if (< z 0) (to-uint (- 0 z)) (to-uint z)))
            (z-squared (mul-down z-abs z-abs))

            ;; Divide by 2: z^2/2 using fixed-point division
            (z-squared-half (div-down z-squared u200000000))

            ;; Negate: -z^2/2 (as int for exp-taylor)
            (neg-z-squared-half (- 0 (to-int z-squared-half)))

            ;; Calculate e^(-z^2/2) using Taylor series
            (exp-result (exp-taylor neg-z-squared-half))

            ;; Multiply by INV_SQRT_2PI: (1/sqrt(2*pi)) * e^(-z^2/2)
            (pdf (mul-down exp-result INV_SQRT_2PI))
        )
        pdf
    )
)

;; @doc Calculate e^x using Taylor series approximation with 10 terms for high precision
;; @param x: Exponent in 8-decimal fixed point (int, can be negative)
;; @return: e^x in 8-decimal fixed point
;;
;; Taylor series: e^x = 1 + x + x^2/2! + x^3/3! + ... + x^10/10!
;; For x < 0: e^x = 1 / e^(-x)
(define-read-only (exp-taylor (x int))
    (if (< x 0)
        ;; For negative x: e^x = 1 / e^(-x)
        (if (>= (- 0 x) 1800000000) ;; -18.0 (MIN_NATURAL_EXPONENT from ALEX)
            u0 ;; Very close to 0 for large negative numbers
            ;; Calculate e^(-x) and invert
            (let (
                    (neg-x (to-uint (- 0 x)))
                    ;; Pre-compute powers of x for efficiency
                    (x2 (mul-down neg-x neg-x))
                    (x3 (mul-down x2 neg-x))
                    (x4 (mul-down x3 neg-x))
                    (x5 (mul-down x4 neg-x))
                    (x6 (mul-down x5 neg-x))
                    (x7 (mul-down x6 neg-x))
                    (x8 (mul-down x7 neg-x))
                    (x9 (mul-down x8 neg-x))
                    (x10 (mul-down x9 neg-x))
                    ;; Taylor series terms: 1 + x + x^2/2! + x^3/3! + ... + x^10/10!
                    ;; Factorials: 2!=2, 3!=6, 4!=24, 5!=120, 6!=720, 7!=5040, 8!=40320, 9!=362880, 10!=3628800
                    (sum (+ (+ (+ (+ (+ (+ (+ (+ (+ (+
                        u100000000                                    ;; 1
                        neg-x)                                        ;; x
                        (div-down x2 u200000000))                     ;; x^2/2!
                        (div-down x3 u600000000))                     ;; x^3/3!
                        (div-down x4 u2400000000))                    ;; x^4/4!
                        (div-down x5 u12000000000))                   ;; x^5/5!
                        (div-down x6 u72000000000))                   ;; x^6/6!
                        (div-down x7 u504000000000))                  ;; x^7/7!
                        (div-down x8 u4032000000000))                 ;; x^8/8!
                        (div-down x9 u36288000000000))                ;; x^9/9!
                        (div-down x10 u362880000000000)))             ;; x^10/10!
                )
                (if (is-eq sum u0)
                    u0
                    (div-down ONE_8 sum))
            )
        )
        ;; For positive x: use Taylor series
        (let (
                (x-uint (to-uint x))
                ;; Pre-compute powers of x
                (x2 (mul-down x-uint x-uint))
                (x3 (mul-down x2 x-uint))
                (x4 (mul-down x3 x-uint))
                (x5 (mul-down x4 x-uint))
                (x6 (mul-down x5 x-uint))
                (x7 (mul-down x6 x-uint))
                (x8 (mul-down x7 x-uint))
                (x9 (mul-down x8 x-uint))
                (x10 (mul-down x9 x-uint))
                ;; Taylor series with 10 terms
                (sum (+ (+ (+ (+ (+ (+ (+ (+ (+ (+
                    u100000000                                    ;; 1
                    x-uint)                                       ;; x
                    (div-down x2 u200000000))                     ;; x^2/2!
                    (div-down x3 u600000000))                     ;; x^3/3!
                    (div-down x4 u2400000000))                    ;; x^4/4!
                    (div-down x5 u12000000000))                   ;; x^5/5!
                    (div-down x6 u72000000000))                   ;; x^6/6!
                    (div-down x7 u504000000000))                  ;; x^7/7!
                    (div-down x8 u4032000000000))                 ;; x^8/8!
                    (div-down x9 u36288000000000))                ;; x^9/9!
                    (div-down x10 u362880000000000)))             ;; x^10/10!
            )
            (if (> sum u69000000000) u69000000000 sum)
        )
    )
)

;; @doc Calculate the Cumulative Distribution Function (CDF) of standard normal distribution
;; @param z: Z-score in 8-decimal fixed point (e.g., 100000000 = 1.0)
;; @return: CDF value Phi(z) in 8-decimal fixed point
;;
;; For z >= 0: Uses Abramowitz-Stegun approximation
;; For z < 0: Uses symmetry: Phi(z) = 1 - Phi(-z)
(define-read-only (normal-cdf (z int))
    (if (is-eq z 0)
        ;; Phi(0) = 0.5
        u50000000
        (if (> z 0)
            ;; z > 0: Use Abramowitz-Stegun approximation
            (normal-cdf-positive z)
            ;; z < 0: Use symmetry Phi(z) = 1 - Phi(-z)
            (- u100000000 (normal-cdf-positive (- 0 z)))
        )
    )
)

;; @doc Calculate CDF for positive z using Abramowitz-Stegun approximation
;; @param z: Positive Z-score in 8-decimal fixed point
;; @return: CDF value Phi(z) in 8-decimal fixed point
;;
;; Formula: Phi(z) ~= 1 - phi(z) * (b1*t - b2*t^2 + b3*t^3 - b4*t^4 + b5*t^5)
;; where t = 1/(1 + p*z)
(define-read-only (normal-cdf-positive (z int))
    (let (
            ;; Convert z to uint (safe because this function only receives positive z)
            (z-uint (to-uint z))
            ;; Calculate t = 1/(1 + p*z)
            (p-times-z (mul-down AS_P z-uint))
            (denominator (+ u100000000 p-times-z))
            (t (div-down u100000000 denominator))

            ;; Calculate polynomial powers of t
            (t-squared (mul-down t t))
            (t-cubed (mul-down t-squared t))
            (t-fourth (mul-down t-cubed t))
            (t-fifth (mul-down t-fourth t))

            ;; Calculate each term (all positive)
            (term1 (mul-down AS_B1 t))        ;; b1*t (positive in formula)
            (term2 (mul-down AS_B2 t-squared)) ;; b2*t^2 (negative in formula)
            (term3 (mul-down AS_B3 t-cubed))   ;; b3*t^3 (positive in formula)
            (term4 (mul-down AS_B4 t-fourth))  ;; b4*t^4 (negative in formula)
            (term5 (mul-down AS_B5 t-fifth))   ;; b5*t^5 (positive in formula)

            ;; Sum: b1*t - b2*t^2 + b3*t^3 - b4*t^4 + b5*t^5
            ;; Group positive and negative to avoid underflow:
            ;; positive_sum = term1 + term3 + term5
            ;; negative_sum = term2 + term4
            ;; poly = positive_sum - negative_sum (safe if positive > negative, which it is for CDF)
            (positive-sum (+ (+ term1 term3) term5))
            (negative-sum (+ term2 term4))
            (poly (if (> positive-sum negative-sum)
                (- positive-sum negative-sum)
                u0))

            ;; Get PDF value: phi(z)
            (pdf (normal-pdf z))

            ;; Calculate phi(z) * polynomial
            (pdf-times-poly (mul-down pdf poly))

            ;; Phi(z) = 1 - phi(z) * polynomial
            ;; For positive z, pdf-times-poly is always < 1, so this won't underflow
            (cdf (if (> u100000000 pdf-times-poly)
                (- u100000000 pdf-times-poly)
                u0))
        )
        cdf
    )
)

;; ============================================================================
;; pm-AMM Pricing Functions
;; ============================================================================

;; @doc Calculate the YES token price for given reserves and liquidity
;; @param x: YES token reserve amount
;; @param y: NO token reserve amount
;; @param L: Liquidity parameter
;; @return: YES token price in 8-decimal fixed point (0 to ONE_8)
;;
;; Formula: price = Phi((y-x)/L)
;; Note: (y-x) can be negative when x > y, so we handle sign separately
(define-read-only (get-yes-price (x uint) (y uint) (L uint))
    (let (
            ;; Calculate z = (y - x) / L, handling negative case
            ;; When y >= x: z is positive
            ;; When x > y: z is negative
            (z-int (if (>= y x)
                ;; Positive z: (y - x) / L
                (to-int (div-down (- y x) L))
                ;; Negative z: -((x - y) / L)
                (- 0 (to-int (div-down (- x y) L)))))

            ;; Return Phi(z) which is the YES price
            (price (normal-cdf z-int))
        )
        price
    )
)

;; @doc Calculate the NO token price for given reserves and liquidity
;; @param x: YES token reserve amount
;; @param y: NO token reserve amount
;; @param L: Liquidity parameter
;; @return: NO token price in 8-decimal fixed point (0 to ONE_8)
;;
;; Formula: no_price = 1 - yes_price
;; Prices must always sum to ONE_8 (100000000)
(define-read-only (get-no-price (x uint) (y uint) (L uint))
    (let (
            ;; Get YES price
            (yes-price (get-yes-price x y L))

            ;; NO price = 1 - YES price
            (no-price (- u100000000 yes-price))
        )
        no-price
    )
)

;; ============================================================================
;; pm-AMM Invariant and Swap Functions
;; ============================================================================

;; @doc Calculate the pm-AMM invariant for given reserves and liquidity
;; @param x: YES token reserve amount
;; @param y: NO token reserve amount
;; @param L: Liquidity parameter
;; @return: Invariant value as int (can be negative, should remain constant during swaps)
;;
;; Formula: invariant = (y-x)*Phi((y-x)/L) + L*phi((y-x)/L) - y
;; Note: The invariant CAN be negative - this is mathematically correct
(define-read-only (pm-amm-invariant (x uint) (y uint) (L uint))
    (let (
            ;; Calculate |y - x| and track sign
            (y-ge-x (>= y x))
            (abs-diff (if y-ge-x (- y x) (- x y)))
            (z-abs (div-down abs-diff L))
            (z-int (if y-ge-x (to-int z-abs) (- 0 (to-int z-abs))))

            ;; Get Phi(z) - CDF
            (cdf (normal-cdf z-int))

            ;; Get phi(z) - PDF (symmetric, always positive)
            (pdf (normal-pdf z-int))

            ;; Calculate term1: (y-x)*Phi((y-x)/L)
            ;; If y >= x: term1 = (y-x) * cdf (positive)
            ;; If x > y: term1 = -(x-y) * cdf (negative)
            (term1-abs (mul-down abs-diff cdf))
            (term1-int (if y-ge-x (to-int term1-abs) (- 0 (to-int term1-abs))))

            ;; Calculate term2: L*phi((y-x)/L) (always positive)
            (term2 (mul-down L pdf))
            (term2-int (to-int term2))

            ;; Calculate invariant: (y-x)*cdf + L*pdf - y
            ;; Result can be negative - use safe operations to prevent underflow/overflow
            (y-int (to-int y))
            (sum-int (safe-int-add term1-int term2-int))
            (invariant (safe-int-sub sum-int y-int))
        )
        invariant
    )
)

;; Binary search iteration list (20 iterations for precision)
(define-constant BINARY_SEARCH_ITERATIONS
    (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19))

;; @doc Binary search step function for swap calculation
;; @param iteration: Current iteration (ignored, just for fold)
;; @param state: Search state tuple containing bounds and parameters
;; @return: Updated state with narrowed search bounds
(define-private (binary-search-step
    (iteration uint)
    (state {low: uint, high: uint, target-inv: int, amount-in: uint, x: uint, y: uint, L: uint, buy-yes: bool}))
    (let (
            (low (get low state))
            (high (get high state))
            (target-inv (get target-inv state))
            (amount-in (get amount-in state))
            (x (get x state))
            (y (get y state))
            (L (get L state))
            (buy-yes (get buy-yes state))

            ;; Calculate midpoint
            (mid (/ (+ low high) u2))

            ;; Calculate new reserves after potential swap with mid tokens out
            ;; For buy-yes: user gets YES, pool loses YES (x decreases), gains collateral as NO (y increases)
            ;; For buy-no: user gets NO, pool loses NO (y decreases), gains collateral as YES (x increases)
            (new-x (if buy-yes (if (> x mid) (- x mid) u0) (+ x amount-in)))
            (new-y (if buy-yes (+ y amount-in) (if (> y mid) (- y mid) u0)))

            ;; Calculate invariant at midpoint
            (mid-inv (pm-amm-invariant new-x new-y L))
        )
        ;; Update search range based on invariant comparison
        ;; If mid-inv > target-inv, we're giving out too many tokens, search lower
        ;; If mid-inv < target-inv, we can give out more tokens, search higher
        (if (> mid-inv target-inv)
            {low: low, high: mid, target-inv: target-inv, amount-in: amount-in, x: x, y: y, L: L, buy-yes: buy-yes}
            {low: mid, high: high, target-inv: target-inv, amount-in: amount-in, x: x, y: y, L: L, buy-yes: buy-yes}
        )
    )
)

;; @doc Calculate the output amount for a swap using binary search
;; @param amount-in: Amount of collateral being deposited (in 8 decimals)
;; @param x: Current YES token reserve
;; @param y: Current NO token reserve
;; @param L: Liquidity parameter
;; @param buy-yes: true if buying YES tokens, false if buying NO tokens
;; @return: tokens-out amount that preserves the pm-AMM invariant
;;
;; Uses binary search to find the exact tokens-out that maintains the invariant.
;; For buy-yes: User deposits collateral, receives YES. x decreases, y increases by amount-in
;; For buy-no: User deposits collateral, receives NO. y decreases, x increases by amount-in
(define-read-only (calculate-swap-out (amount-in uint) (x uint) (y uint) (L uint) (buy-yes bool))
    (let (
            ;; Calculate target invariant (must be preserved after swap)
            (target-inv (pm-amm-invariant x y L))

            ;; Initial search bounds
            ;; low = 0, high = available reserve (can't give out more than we have)
            (max-reserve (if buy-yes x y))

            ;; Initial state for binary search
            (initial-state {
                low: u0,
                high: max-reserve,
                target-inv: target-inv,
                amount-in: amount-in,
                x: x,
                y: y,
                L: L,
                buy-yes: buy-yes
            })

            ;; Run 20 iterations of binary search using fold
            (final-state (fold binary-search-step BINARY_SEARCH_ITERATIONS initial-state))

            ;; Return midpoint of final range as the result
            (result (/ (+ (get low final-state) (get high final-state)) u2))
        )
        result
    )
)

;; ============================================================================
;; Dynamic Liquidity (Optional - Phase 5)
;; ============================================================================

;; @doc Calculate the dynamic liquidity for given initial liquidity and expiry block
;; @param L0: Initial liquidity parameter (uint)
;; @param expiry-block: Expiry block height (uint)
;; @return: Dynamic liquidity L_t in 8-decimal fixed point
;;
;; Formula: L_t = L_0 * sqrt(T-t) where T=expiry, t=current block
;; Reduces liquidity as market approaches expiry to protect LPs
;; Returns 0 at or after expiry (invariant is invalid after expiry)
(define-read-only (get-dynamic-liquidity (L0 uint) (expiry-block uint))
    (let (
            ;; Get current block height
            (current-block block-height)

            ;; Calculate time remaining: T - t
            (time-remaining (- expiry-block current-block))

            ;; Scale time-remaining to fixed-point
            (time-remaining-fixed (* time-remaining ONE_8))
        )
        ;; If no time remaining or already expired, return 0
        (if (<= time-remaining u0)
            u0
            ;; Calculate L_t = L_0 * sqrt(time-remaining / blocks_in_period)
            ;; We normalize by assuming 10080 blocks = 1 week (~1 year max period)
            ;; Using sqrt of time-remaining in weeks
            (let (
                    ;; Convert blocks to weeks (10080 blocks per week)
                    (blocks-per-week u10080)
                    (weeks-remaining (div-down time-remaining-fixed blocks-per-week))

                    ;; Calculate sqrt(weeks-remaining) using integer sqrt approximation
                    ;; sqrt(n) approximation using Newton's method
                    (sqrt-weeks (int-sqrt weeks-remaining))

                    ;; Calculate dynamic liquidity: L_0 * sqrt(weeks-remaining)
                    (dynamic-L (mul-down L0 sqrt-weeks))
                )
                ;; Ensure minimum of 0 and maximum of L0
                (if (> dynamic-L L0) L0 dynamic-L)
            )
        )
    )
)

;; @doc Calculate integer square root using Newton's method
;; @param n: Number to take square root of (uint)
;; @return: Integer square root approximation
(define-read-only (int-sqrt (n uint))
    (if (is-eq n u0)
        u0
        (if (< n u4)
            u1
            ;; Newton's method for sqrt(n)
            ;; Start with guess x = n/2
            ;; Iterate: x_new = (x + n/x) / 2
            (let (
                    (iter1 (div-down (+ (div-down n u200000000) (div-down n (div-down n u200000000))) u200000000))
                    (iter2 (div-down (+ iter1 (div-down n iter1)) u200000000))
                    (iter3 (div-down (+ iter2 (div-down n iter2)) u200000000))
                    (iter4 (div-down (+ iter3 (div-down n iter3)) u200000000))
                    (iter5 (div-down (+ iter4 (div-down n iter4)) u200000000))
                    (iter6 (div-down (+ iter5 (div-down n iter5)) u200000000))
                    (iter7 (div-down (+ iter6 (div-down n iter6)) u200000000))
                    (iter8 (div-down (+ iter7 (div-down n iter7)) u200000000))
                    (iter9 (div-down (+ iter8 (div-down n iter8)) u200000000))
                    (iter10 (div-down (+ iter9 (div-down n iter9)) u200000000))
                )
                iter10
            )
        )
    )
)
