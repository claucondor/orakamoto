;; market-factory.clar
;;
;; This contract is a simple factory for creating prediction markets
;; in a single, shared market-pool contract.

(define-constant POOL-CONTRACT .market-pool)

(define-constant MINIMUM-COLLATERAL u50000000) ;; 50 USDC (with 6 decimals)
(define-constant DEFAULT-RESOLUTION-WINDOW u1008) ;; ~7 days in blocks

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INSUFFICIENT-COLLATERAL (err u101))
(define-constant ERR-INVALID-DEADLINE (err u104))

;; ---
;; Public Functions
;; ---

(define-public (create-market (question (string-utf8 256)) (deadline uint) (collateral uint))
  (begin
    (asserts! (>= collateral MINIMUM-COLLATERAL) ERR-INSUFFICIENT-COLLATERAL)
    (asserts! (> deadline block-height) ERR-INVALID-DEADLINE)
    (contract-call? POOL-CONTRACT create-market-in-pool question deadline collateral tx-sender)
  )
)

(define-public (deactivate-market (id uint))
  (contract-call? POOL-CONTRACT deactivate-market id)
)

;; ---
;; Read-Only Functions (proxies to the pool contract)
;; ---

(define-read-only (get-market-count)
  (contract-call? POOL-CONTRACT get-market-count)
)

(define-read-only (get-market (id uint))
  (contract-call? POOL-CONTRACT get-market id)
)

(define-read-only (get-creator-markets (creator principal))
  (contract-call? POOL-CONTRACT get-creator-markets creator)
)