;; Governance Token Contract for StackPredict Protocol
;; Token: $PRED - Earned by participating in the protocol
;; SIP-010 fungible token standard implementation

(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "StackPredict Governance")
(define-constant TOKEN-SYMBOL "PRED")
(define-constant TOKEN-DECIMALS u8)

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u500))
(define-constant ERR-NOT-TOKEN-OWNER (err u501))
(define-constant ERR-ZERO-AMOUNT (err u502))
(define-constant ERR-INSUFFICIENT-BALANCE (err u503))

;; Define the fungible token
(define-fungible-token pred)

;; Data maps
;; Track delegated voting power (for future vote-escrow integration)
(define-map delegations principal principal)

;; SIP-010 Transfer
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? pred amount sender recipient))
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
  (ok (ft-get-balance pred who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply pred)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Mint - Restricted to reward contracts
;; Only called by LP rewards, trader rewards, or creator rewards contracts
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-mint? pred amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)))

;; Burn - Allows token holders to burn their own tokens
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance pred caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? pred amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)))

;; Delegate - Allow users to delegate their voting power to another address
;; This is a placeholder for future vote-escrow integration
(define-public (delegate (delegatee principal))
  (let
    (
      (caller tx-sender)
    )
    (asserts! (not (is-eq caller delegatee)) ERR-NOT-AUTHORIZED)
    (map-set delegations caller delegatee)
    (print {event: "delegate", delegator: caller, delegatee: delegatee})
    (ok true)))

;; Get Delegation - Read who a user has delegated to
(define-read-only (get-delegation (who principal))
  (ok (default-to who (map-get? delegations who))))

;; Get Voting Power - Placeholder for future vote-escrow integration
;; Currently returns token balance (1 token = 1 vote)
;; Future implementation will consider time-lock multipliers
(define-read-only (get-voting-power (who principal))
  (ok (ft-get-balance pred who)))
