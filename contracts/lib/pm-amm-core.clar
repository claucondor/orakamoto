;; pm-amm-core.clar
;; Prediction Market AMM Core Library
;; Implements the pm-AMM algorithm from Paradigm Research
;; Reference: https://www.paradigm.xyz/2024/11/pm-amm
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

;; Helper function for fixed-point division
(define-read-only (div-down (a uint) (b uint))
    (if (is-eq a u0)
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
            ;; Square z: z^2
            (z-squared (* z z))

            ;; Divide by 2: z^2/2 (need to scale for fixed point)
            ;; z^2 is already scaled, so divide by 2*ONE_8
            (z-squared-half (/ z-squared u200000000))

            ;; Negate: -z^2/2
            (neg-z-squared-half (* z-squared-half u-1))

            ;; Calculate e^(-z^2/2) using Taylor series
            (exp-result (exp-taylor neg-z-squared-half))

            ;; Multiply by INV_SQRT_2PI: (1/sqrt(2*pi)) * e^(-z^2/2)
            (pdf (mul-down exp-result INV_SQRT_2PI))
        )
        pdf
    )
)

;; @doc Calculate e^x using Taylor series approximation
;; @param x: Exponent in 8-decimal fixed point (int, can be negative)
;; @return: e^x in 8-decimal fixed point
;;
;; Taylor series: e^x = 1 + x + x^2/2! + x^3/3! + x^4/4! + ...
;; For x < 0: e^x = 1 / e^(-x)
(define-read-only (exp-taylor (x int))
    (if (< x 0)
        ;; For negative x: e^x = 1 / e^(-x)
        (if (>= (* x u-1) u1800000000) ;; -18.0 (MIN_NATURAL_EXPONENT from ALEX)
            u0 ;; Very close to 0 for large negative numbers
            ;; Calculate e^(-x) and invert
            (let (
                    (neg-x (* x u-1))
                    ;; Taylor series for e^(-x) where -x > 0
                    (term1 u100000000) ;; 1
                    (term2 neg-x)       ;; -x
                    (term3 (div-down (* neg-x neg-x) u200000000))
                    (term4 (div-down (div-down (* neg-x neg-x) neg-x) u600000000))
                    (term5 (div-down (div-down (div-down (* neg-x neg-x) neg-x) neg-x) u2400000000))
                    (term6 (div-down (div-down (div-down (div-down (* neg-x neg-x) neg-x) neg-x) neg-x) u12000000000))
                    (sum (+ (+ (+ (+ (+ term1 term2) term3) term4) term5) term6))
                )
                (if (is-eq sum u0)
                    u0
                    (/ u100000000 (to-uint sum)) ;; 1 / e^(-x) scaled
                )
            )
        )
        ;; For positive x: use Taylor series
        (let (
                ;; Taylor series terms
                (term1 u100000000) ;; 1 (first term)
                (term2 x)          ;; x
                ;; x^2 / 2! = x * x / 2
                (term3 (div-down (* x x) u200000000))
                ;; x^3 / 3! = x^2 * x / 6
                (term4 (div-down (div-down (* x x) x) u600000000))
                ;; x^4 / 4! = x^3 * x / 24
                (term5 (div-down (div-down (div-down (* x x) x) x) u2400000000))
                ;; x^5 / 5! = x^4 * x / 120
                (term6 (div-down (div-down (div-down (div-down (* x x) x) x) x) u12000000000))

                ;; Sum the series
                (sum (+ (+ (+ (+ (+ term1 term2) term3) term4) term5) term6))
            )
            ;; Clamp to reasonable range to avoid overflow
            (let ((clamped-sum (if (> sum u69000000000) u69000000000 sum)))
                (to-uint clamped-sum)
            )
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
    (if (is-eq z u0)
        ;; Phi(0) = 0.5
        u50000000
        (if (> z u0)
            ;; z > 0: Use Abramowitz-Stegun approximation
            (normal-cdf-positive z)
            ;; z < 0: Use symmetry Phi(z) = 1 - Phi(-z)
            (- u100000000 (normal-cdf-positive (* z u-1)))
        )
    )
)

;; @doc Calculate CDF for positive z using Abramowitz-Stegun approximation
;; @param z: Positive Z-score in 8-decimal fixed point
;; @return: CDF value Phi(z) in 8-decimal fixed point
;;
;; Formula: Phi(z) ~= 1 - phi(z) * (b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5)
;; where t = 1/(1 + p*z)
(define-read-only (normal-cdf-positive (z int))
    (let (
            ;; Calculate t = 1/(1 + p*z)
            (p-times-z (mul-down AS_P z))
            (denominator (+ u100000000 p-times-z))
            (t (div-down u100000000 denominator))

            ;; Calculate polynomial: b1*t + b2*t^2 + b3*t^3 + b4*t^4 + b5*t^5
            (t-squared (mul-down t t))
            (t-cubed (mul-down t-squared t))
            (t-fourth (mul-down t-cubed t))
            (t-fifth (mul-down t-fourth t))

            ;; b1*t
            (term1 (mul-down AS_B1 t))
            ;; b2*t^2 (negative)
            (term2 (mul-down AS_B2 t-squared))
            ;; b3*t^3
            (term3 (mul-down AS_B3 t-cubed))
            ;; b4*t^4 (negative)
            (term4 (mul-down AS_B4 t-fourth))
            ;; b5*t^5
            (term5 (mul-down AS_B5 t-fifth))

            ;; Sum terms: b1*t - b2*t^2 + b3*t^3 - b4*t^4 + b5*t^5
            (poly (+ (- (+ (- (+ term1 term2) term3) term4) term5) term5))

            ;; Get PDF value: phi(z)
            (pdf (normal-pdf z))

            ;; Calculate phi(z) * polynomial
            (pdf-times-poly (mul-down pdf poly))

            ;; Phi(z) = 1 - phi(z) * polynomial
            (cdf (- u100000000 pdf-times-poly))
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
(define-read-only (get-yes-price (x uint) (y uint) (L uint))
    (let (
            ;; Calculate z = (y - x) / L
            (y-minus-x (- y x))
            (z (div-down y-minus-x L))

            ;; Convert to int for CDF function
            (z-int (to-int z))

            ;; Return Phi(z) which is the YES price
            (price (normal-cdf z-int))
        )
        (to-uint price)
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
;; @return: Invariant value (should remain constant during swaps)
;;
;; Formula: invariant = (y-x)*Phi((y-x)/L) + L*phi((y-x)/L) - y
(define-read-only (pm-amm-invariant (x uint) (y uint) (L uint))
    (let (
            ;; Calculate z = (y - x) / L
            (y-minus-x (- y x))
            (z (div-down y-minus-x L))
            (z-int (to-int z))

            ;; Get Phi(z) - CDF
            (cdf (normal-cdf z-int))

            ;; Get phi(z) - PDF
            (pdf (normal-pdf z-int))

            ;; Calculate term1: (y-x)*Phi((y-x)/L)
            (term1 (mul-down y-minus-x cdf))

            ;; Calculate term2: L*phi((y-x)/L)
            (term2 (mul-down L pdf))

            ;; Calculate invariant: term1 + term2 - y
            (invariant (- (+ term1 term2) y))
        )
        invariant
    )
)

;; @doc Calculate the output amount for a swap using binary search
;; @param amount-in: Amount of tokens being sold
;; @param x: Current YES token reserve
;; @param y: Current NO token reserve
;; @param L: Liquidity parameter
;; @param buy-yes: true if buying YES tokens, false if buying NO tokens
;; @return: (ok tokens-out) or error if swap not possible
;;
;; For buy-yes: User sells NO, receives YES. New state: x' < x, y' > y
;; For buy-no: User sells YES, receives NO. New state: x' > x, y' < y
;;
;; Uses binary search to find tokens-out that maintains the invariant
(define-read-only (calculate-swap-out (amount-in uint) (x uint) (y uint) (L uint) (buy-yes bool))
    (begin
        ;; Calculate initial invariant
        (let ((initial-invariant (pm-amm-invariant x y L)))

            ;; Binary search bounds
            (define-private (binary-search (low uint) (high uint) (iteration uint))
                (if (>= iteration u50)
                    ;; Max iterations reached, return current high
                    (ok high)
                    (let ((mid (div-down (+ low high) u200000000)))
                        (if (is-eq mid u0)
                            (ok low)
                            (let (
                                    ;; Calculate new reserves after swap
                                    (new-x (if buy-yes (- x mid) (+ x mid)))
                                    (new-y (if buy-yes (+ y amount-in) (- y amount-in)))

                                    ;; Check for underflow/overflow
                                    (check-reserves (and
                                        (if buy-yes (>= new-x x) (>= new-x x))
                                        (if buy-yes (>= new-y y) (>= new-y y))
                                    ))
                                )
                                (if (not check-reserves)
                                    (binary-search low (- mid u1) (+ iteration u1))
                                    (let ((new-invariant (pm-amm-invariant new-x new-y L)))
                                        (if (>= new-invariant initial-invariant)
                                            ;; Invariant is maintained or increased, try higher
                                            (binary-search mid high (+ iteration u1))
                                            ;; Invariant decreased, try lower
                                            (binary-search low mid (+ iteration u1))
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            )

            ;; Start binary search
            ;; Maximum possible output is the reserve being bought
            (binary-search u0 (if buy-yes x y) u0)
        )
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
