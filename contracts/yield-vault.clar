;; Yield Vault Contract for StackPredict Protocol
;; A yield-bearing vault that wraps USDC and generates yield
;; This contract can be swapped for a production Zest Protocol vault contract via trait-based architecture

;; Traits
(impl-trait .sip-010-trait.sip-010-trait)

;; Vault Interface Trait
;; This trait allows the yield-vault to be swapped with different vault implementations
;; In production, this contract can be replaced with a real Zest Protocol vault contract
(define-trait vault-trait
  (
    ;; Supply USDC into vault and receive yield-bearing shares
    (supply (uint principal) (response bool uint))

    ;; Withdraw USDC from vault (including accrued yield)
    (withdraw (uint principal) (response uint uint))

    ;; Get total deposits in vault
    (get-total-deposits () (response uint uint))

    ;; Get current APY in basis points
    (get-apy () (response uint uint))
  )
)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "Yield Vault")
(define-constant TOKEN-SYMBOL "yUSDC")
(define-constant TOKEN-DECIMALS u6)

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-NOT-TOKEN-OWNER (err u201))
(define-constant ERR-ZERO-AMOUNT (err u202))
(define-constant ERR-INSUFFICIENT-BALANCE (err u203))
(define-constant ERR-VAULT-NOT-INITIALIZED (err u204))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u205))

;; Define the fungible token (yUSDC - yield-bearing USDC shares)
(define-fungible-token y-usdc)

;; Data Variables
(define-data-var yield-rate-bp uint u500)     ;; 5% annual yield rate in basis points
(define-data-var total-deposits uint u0)      ;; Total USDC deposited into underlying
(define-data-var total-yield-earned uint u0)  ;; Total yield earned since inception
(define-data-var last-yield-update uint u0)   ;; Block height of last yield calculation

;; Maps
;; Track user deposits for yield calculation
(define-map user-deposits principal uint)

;; SIP-010 Transfer (yUSDC tokens represent vault shares)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? y-usdc amount sender recipient))
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

;; SIP-010 Get Balance (yUSDC balance = vault share)
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance y-usdc who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply y-usdc)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Supply - Deposit USDC into the vault
;; The vault holds USDC and mints yield-bearing yUSDC shares
(define-public (supply (amount uint) (owner principal))
  (let
    (
      (caller tx-sender)
      (current-total-deposits (var-get total-deposits))
      (current-total-shares (ft-get-supply y-usdc))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (is-eq caller owner) ERR-NOT-AUTHORIZED)

    ;; Transfer USDC from user to this vault contract
    (try! (contract-call? .mock-usdc transfer amount caller (as-contract tx-sender) none))

    ;; Calculate shares to mint
    ;; If first deposit: 1:1 ratio
    ;; Otherwise: shares = (amount * total-shares) / total-deposits
    (let
      (
        (shares-to-mint
          (if (is-eq current-total-shares u0)
            amount  ;; First deposit gets 1:1 shares
            (/ (* amount current-total-shares) current-total-deposits)
          )
        )
      )
      ;; Update state
      (var-set total-deposits (+ current-total-deposits amount))
      (var-set last-yield-update block-height)
      (map-set user-deposits owner (+ (default-to u0 (map-get? user-deposits owner)) amount))

      ;; Mint yUSDC shares to user
      (try! (ft-mint? y-usdc shares-to-mint owner))

      (print {event: "supply", provider: caller, owner: owner, amount: amount, shares: shares-to-mint})
      (ok true)
    )
  )
)

;; Withdraw - Withdraw USDC from the vault
;; Returns USDC amount including accrued yield
(define-public (withdraw (amount uint) (owner principal))
  (let
    (
      (caller tx-sender)
      (current-total-deposits (var-get total-deposits))
      (current-total-shares (ft-get-supply y-usdc))
      (owner-shares (ft-get-balance y-usdc owner))
      (owner-deposits (default-to u0 (map-get? user-deposits owner)))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (is-eq caller owner) ERR-NOT-AUTHORIZED)
    (asserts! (>= owner-shares amount) ERR-INSUFFICIENT-BALANCE)
    (asserts! (>= current-total-deposits amount) ERR-INSUFFICIENT-LIQUIDITY)

    ;; Calculate USDC to return (including accrued yield)
    ;; usdc-out = (shares * total-deposits) / total-shares
    (let
      (
        (usdc-out
          (if (is-eq current-total-shares u0)
            u0
            (/ (* amount current-total-deposits) current-total-shares)
          )
        )
      )
      ;; Update state
      (var-set total-deposits (- current-total-deposits usdc-out))
      (map-set user-deposits owner (- owner-deposits usdc-out))

      ;; Burn yUSDC shares
      (try! (ft-burn? y-usdc amount owner))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .mock-usdc transfer usdc-out tx-sender owner none)))

      (print {event: "withdraw", withdrawer: caller, owner: owner, shares-burned: amount, usdc-returned: usdc-out})
      (ok usdc-out)
    )
  )
)

;; Harvest Yield - Calculate and distribute earned yield
;; Anyone can call this to update yield calculations
(define-public (harvest-yield)
  (let
    (
      (current-block block-height)
      (last-update (var-get last-yield-update))
      (blocks-elapsed (- current-block last-update))
      (yield-rate (var-get yield-rate-bp))
      (deposits (var-get total-deposits))
    )
    (asserts! (> deposits u0) ERR-VAULT-NOT-INITIALIZED)

    ;; Calculate yield: deposits * (yield-rate / 10000) * (blocks-elapsed / 525600)
    ;; 525600 = blocks per year (144 blocks/day * 365 days)
    ;; Using integer math: yield = (deposits * yield-rate * blocks-elapsed) / (10000 * 525600)
    (let
      (
        (yield-earned
          (/ (* (* deposits yield-rate) blocks-elapsed) u5256000000)
        )
      )
      (if (> yield-earned u0)
        (begin
          ;; Update state
          (var-set total-yield-earned (+ (var-get total-yield-earned) yield-earned))
          (var-set last-yield-update current-block)

          ;; Mint new yUSDC shares to distribute yield proportionally to all holders
          ;; Yield is distributed as additional shares (reinvesting)
          (try! (ft-mint? y-usdc yield-earned CONTRACT-OWNER))

          (print {event: "yield-harvest", amount: yield-earned, blocks-elapsed: blocks-elapsed})
          (ok yield-earned)
        )
        (ok u0)  ;; No yield to harvest yet
      )
    )
  )
)

;; Read-only: Get total USDC deposited in vault
(define-read-only (get-total-deposits)
  (ok (var-get total-deposits)))

;; Read-only: Get total yield earned since inception
(define-read-only (get-total-yield-earned)
  (ok (var-get total-yield-earned)))

;; Read-only: Get current yield rate (in basis points)
(define-read-only (get-yield-rate)
  (ok (var-get yield-rate-bp)))

;; Read-only: Get current APY
(define-read-only (get-apy)
  (ok (var-get yield-rate-bp)))

;; Read-only: Get pending yield for a specific user
;; Calculated based on their share of the vault
(define-read-only (get-pending-yield (who principal))
  (let
    (
      (user-shares (ft-get-balance y-usdc who))
      (total-shares (ft-get-supply y-usdc))
      (deposits (var-get total-deposits))
    )
    (if (or (is-eq total-shares u0) (is-eq user-shares u0))
      (ok u0)
      (ok (/ (* user-shares deposits) total-shares))
    )
  )
)

;; Read-only: Get user's effective balance (shares * price per share)
(define-read-only (get-effective-balance (who principal))
  (let
    (
      (user-shares (ft-get-balance y-usdc who))
      (total-shares (ft-get-supply y-usdc))
      (deposits (var-get total-deposits))
    )
    (if (or (is-eq total-shares u0) (is-eq user-shares u0))
      (ok u0)
      (ok (/ (* user-shares deposits) total-shares))
    )
  )
)

;; Read-only: Get user's deposited amount
(define-read-only (get-user-deposits (who principal))
  (ok (default-to u0 (map-get? user-deposits who))))

;; Admin: Set yield rate (for testing different scenarios)
(define-public (set-yield-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-rate u10000) ERR-ZERO-AMOUNT) ;; Max 100% APY
    (var-set yield-rate-bp new-rate)
    (print {event: "yield-rate-changed", new-rate: new-rate})
    (ok true)
  )
)

;; Admin: Mint tokens (for testing)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-mint? y-usdc amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)
  )
)

;; Admin: Burn tokens (for testing)
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance y-usdc caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? y-usdc amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)
  )
)
