;; SIP-013 LP Token Contract for StackPredict Protocol
;; Implements Semi-Fungible Token standard for LP tokens
;;
;; Each token-id represents LP shares for a specific market:
;; - token-id = market-id
;; - amount = LP shares for that market
;;
;; This contract allows multi-market-pool to mint/burn LP tokens
;; and allows LP token holders to transfer their tokens

(impl-trait .sip013-semi-fungible-token-trait.sip013-semi-fungible-token-trait)

;; ============================================
;; CONSTANTS
;; ============================================
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "StackPredict LP Token")
(define-constant TOKEN-SYMBOL "SPLP")
(define-constant TOKEN-DECIMALS u6)

;; The multi-market-pool contract is the only authorized caller for mint/burn
;; Initially set to deployer, can be updated via set-authorized-minter
(define-data-var authorized-minter principal tx-sender)

;; ============================================
;; ERROR CONSTANTS
;; ============================================
(define-constant ERR-NOT-AUTHORIZED (err u3000))
(define-constant ERR-INSUFFICIENT-BALANCE (err u3001))
(define-constant ERR-INVALID-SENDER (err u3002))
(define-constant ERR-ZERO-AMOUNT (err u3003))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Token balances by token-id and owner
;; Key: { token-id: uint, owner: principal }
;; Value: balance (uint)
(define-map token-balances
  { token-id: uint, owner: principal }
  uint
)

;; Token supplies by token-id
;; Key: token-id (uint)
;; Value: total supply (uint)
(define-map token-supplies
  uint
  uint
)

;; ============================================
;; SIP-013 TRAIT FUNCTIONS
;; ============================================

;; Get the balance of a specific token-id for a principal
(define-read-only (get-balance (token-id uint) (who principal))
  (ok (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: who}))))
)

;; Get the overall balance (sum of all token-ids) for a principal
(define-read-only (get-overall-balance (who principal))
  ;; Note: In Clarity, we cannot iterate over all token-ids efficiently
  ;; This function returns u0 as a placeholder
  ;; For production, consider tracking per-principal totals separately
  (ok u0)
)

;; Get the total supply of a specific token-id
(define-read-only (get-total-supply (token-id uint))
  (ok (default-to u0 (map-get? token-supplies token-id)))
)

;; Get the overall supply (sum of all token supplies)
(define-read-only (get-overall-supply)
  ;; Note: In Clarity, we cannot iterate over all token-ids efficiently
  ;; This function returns u0 as a placeholder
  ;; For production, consider tracking total supply separately
  (ok u0)
)

;; Get the number of decimals for a token-id
(define-read-only (get-decimals (token-id uint))
  (ok TOKEN-DECIMALS)
)

;; Get the URI for token metadata
(define-read-only (get-token-uri (token-id uint))
  ;; Return none - no metadata URI for LP tokens
  (ok none)
)

;; Transfer tokens from sender to recipient
(define-public (transfer (token-id uint) (amount uint) (sender principal) (recipient principal))
  (let
    (
      (caller tx-sender)
      (sender-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: sender}))))
    )
    ;; Validate sender is the tx-sender
    (asserts! (is-eq caller sender) ERR-INVALID-SENDER)

    ;; Validate amount > 0
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Validate sender has sufficient balance
    (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)

    ;; Prevent sending to self (no-op)
    (asserts! (not (is-eq sender recipient)) (ok true))

    ;; Transfer tokens
    (map-set token-balances (merge {token-id: token-id} {owner: sender}) (- sender-balance amount))

    (let
      (
        (recipient-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: recipient}))))
      )
      (map-set token-balances (merge {token-id: token-id} {owner: recipient}) (+ recipient-balance amount))
    )

    ;; Emit event
    (print {event: "transfer", token-id: token-id, sender: sender, recipient: recipient, amount: amount})

    (ok true)
  )
)

;; Transfer tokens from sender to recipient with memo
(define-public (transfer-memo (token-id uint) (amount uint) (sender principal) (recipient principal) (memo (buff 34)))
  (let
    (
      (caller tx-sender)
      (sender-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: sender}))))
    )
    ;; Validate sender is the tx-sender
    (asserts! (is-eq caller sender) ERR-INVALID-SENDER)

    ;; Validate amount > 0
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Validate sender has sufficient balance
    (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)

    ;; Prevent sending to self (no-op)
    (asserts! (not (is-eq sender recipient)) (ok true))

    ;; Transfer tokens
    (map-set token-balances (merge {token-id: token-id} {owner: sender}) (- sender-balance amount))

    (let
      (
        (recipient-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: recipient}))))
      )
      (map-set token-balances (merge {token-id: token-id} {owner: recipient}) (+ recipient-balance amount))
    )

    ;; Print memo
    (print memo)

    ;; Emit event
    (print {event: "transfer-memo", token-id: token-id, sender: sender, recipient: recipient, amount: amount})

    (ok true)
  )
)

;; ============================================
;; INTERNAL MINT/BURN FUNCTIONS
;; ============================================

;; Mint tokens - Only callable by authorized minter (multi-market-pool)
(define-public (mint (token-id uint) (amount uint) (recipient principal))
  (let
    (
      (caller contract-caller)
    )
    ;; Only authorized minter can mint
    (asserts! (is-eq caller (var-get authorized-minter)) ERR-NOT-AUTHORIZED)

    ;; Validate amount > 0
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Update recipient balance
    (let
      (
        (recipient-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: recipient}))))
      )
      (map-set token-balances (merge {token-id: token-id} {owner: recipient}) (+ recipient-balance amount))
    )

    ;; Update token supply
    (let
      (
        (current-supply (default-to u0 (map-get? token-supplies token-id)))
      )
      (map-set token-supplies token-id (+ current-supply amount))
    )

    ;; Emit event
    (print {event: "mint", token-id: token-id, recipient: recipient, amount: amount})

    (ok true)
  )
)

;; Burn tokens - Only callable by authorized minter (multi-market-pool)
(define-public (burn (token-id uint) (amount uint) (owner principal))
  (let
    (
      (caller contract-caller)
      (owner-balance (default-to u0 (map-get? token-balances (merge {token-id: token-id} {owner: owner}))))
    )
    ;; Only authorized minter can burn
    (asserts! (is-eq caller (var-get authorized-minter)) ERR-NOT-AUTHORIZED)

    ;; Validate amount > 0
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Validate owner has sufficient balance
    (asserts! (>= owner-balance amount) ERR-INSUFFICIENT-BALANCE)

    ;; Update owner balance
    (map-set token-balances (merge {token-id: token-id} {owner: owner}) (- owner-balance amount))

    ;; Update token supply
    (let
      (
        (current-supply (default-to u0 (map-get? token-supplies token-id)))
      )
      (map-set token-supplies token-id (- current-supply amount))
    )

    ;; Emit event
    (print {event: "burn", token-id: token-id, owner: owner, amount: amount})

    (ok true)
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Set authorized minter - Only callable by contract owner
(define-public (set-authorized-minter (new-minter principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set authorized-minter new-minter)
    (print {event: "set-authorized-minter", new-minter: new-minter})
    (ok true)
  )
)

;; Get authorized minter
(define-read-only (get-authorized-minter)
  (ok (var-get authorized-minter))
)
