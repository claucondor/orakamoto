;; USDCx Mock for StackPredict Protocol (Simnet/Devnet)
;; Simulates Circle's USDCx (bridged USDC on Stacks) for local testing
;; In simnet, deployed at ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
;; Implements SIP-010 fungible token standard

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "USD Coin")
(define-constant TOKEN-SYMBOL "USDCx")
(define-constant TOKEN-DECIMALS u6)
(define-constant FAUCET-AMOUNT u10000000000) ;; 10,000 USDCx (with 6 decimals)

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-FAUCET-LIMIT-EXCEEDED (err u102))
(define-constant ERR-INSUFFICIENT-BALANCE (err u103))
(define-constant ERR-ZERO-AMOUNT (err u104))

;; Define the fungible token
(define-fungible-token usdcx)

;; Data maps
(define-map faucet-claims principal uint)

;; SIP-010 Transfer
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? usdcx amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (print {event: "transfer", sender: sender, recipient: recipient, amount: amount})
    (ok true)))

;; SIP-010 Get Name
(define-read-only (get-name)
  (ok TOKEN-NAME))

;; SIP-010 Get Symbol
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL))

;; SIP-010 Get Decimals
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS))

;; SIP-010 Get Balance
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance usdcx who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply usdcx)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Faucet - allows anyone to mint up to 10,000 USDC for testing
;; Can be called multiple times but total claims cannot exceed FAUCET-AMOUNT
(define-public (faucet (amount uint))
  (let
    (
      (caller tx-sender)
      (previous-claims (default-to u0 (map-get? faucet-claims caller)))
      (new-total (+ previous-claims amount))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= new-total FAUCET-AMOUNT) ERR-FAUCET-LIMIT-EXCEEDED)
    (map-set faucet-claims caller new-total)
    (try! (ft-mint? usdcx amount caller))
    (print {event: "faucet", recipient: caller, amount: amount, total-claimed: new-total})
    (ok true)))

;; Mint - restricted to contract owner
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-mint? usdcx amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)))

;; Burn - allows token holders to burn their own tokens
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance usdcx caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? usdcx amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)))

;; Read-only: Get faucet claims for an address
(define-read-only (get-faucet-claims (who principal))
  (ok (default-to u0 (map-get? faucet-claims who))))

;; Read-only: Get remaining faucet allowance for an address
(define-read-only (get-faucet-remaining (who principal))
  (let
    (
      (claimed (default-to u0 (map-get? faucet-claims who)))
    )
    (ok (- FAUCET-AMOUNT claimed))))
