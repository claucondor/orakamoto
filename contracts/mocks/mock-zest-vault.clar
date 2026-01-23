;; Mock Zest Vault for StackPredict Protocol (Devnet)
;; Simulates Zest Protocol yield farming interface for testing
;; Reference: https://github.com/Zest-Protocol/zest-contracts

;; Traits
(impl-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "Mock Zest Vault")
(define-constant TOKEN-SYMBOL "zUSDC")
(define-constant TOKEN-DECIMALS u6)

;; Token Contract Configuration
;; IMPORTANT: Change this before deployment to testnet/mainnet
;; Simnet/Devnet: .mock-usdc (local reference for testing)
;; Testnet: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
;; Mainnet: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
(define-constant TOKEN-CONTRACT .mock-usdc)

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-ZERO-AMOUNT (err u102))
(define-constant ERR-INSUFFICIENT-BALANCE (err u103))
(define-constant ERR-VAULT-NOT-INITIALIZED (err u104))
(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u105))

;; Define the fungible token (zUSDC - yield-bearing USDC)
(define-fungible-token z-usdc)

;; Data Variables
(define-data-var yield-rate-bp uint u500)     ;; 5% annual yield rate in basis points
(define-data-var total-deposits uint u0)      ;; Total USDC deposited into underlying
(define-data-var total-yield-earned uint u0)  ;; Total yield earned since inception
(define-data-var last-yield-update uint u0)   ;; Block height of last yield calculation

;; SIP-010 Transfer (zUSDC tokens represent vault shares)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-TOKEN-OWNER)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (try! (ft-transfer? z-usdc amount sender recipient))
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

;; SIP-010 Get Balance (zUSDC balance = vault share)
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance z-usdc who)))

;; SIP-010 Get Total Supply
(define-read-only (get-total-supply)
  (ok (ft-get-supply z-usdc)))

;; SIP-010 Get Token URI
(define-read-only (get-token-uri)
  (ok none))

;; Supply - Deposit USDC into the vault
;; Simulates Zest's supply function: supply(lp, pool-reserve, asset, amount, owner)
;; Returns: bool (true on success)
(define-public (supply (amount uint) (owner principal))
  (let
    (
      (caller contract-caller) ;; Use contract-caller so market-pool can supply its own funds
      (current-total-deposits (var-get total-deposits))
      (current-total-shares (ft-get-supply z-usdc))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)

    ;; Transfer USDC from caller (contract-caller) to this vault contract
    ;; When market-pool calls supply, it transfers its own USDC
    (try! (contract-call? .usdcx transfer amount caller (as-contract tx-sender) none))

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

      ;; Mint zUSDC shares to owner (the account that will receive the shares)
      (try! (ft-mint? z-usdc shares-to-mint owner))

      (print {event: "supply", provider: caller, owner: owner, amount: amount, shares: shares-to-mint})
      (ok true)
    )
  )
)

;; Withdraw - Withdraw USDC from the vault
;; Simulates Zest's withdraw function: withdraw(pool-reserve, asset, oracle, assets, amount, current-balance, owner)
;; Returns: uint (amount withdrawn)
(define-public (withdraw (amount uint) (owner principal))
  (let
    (
      (caller contract-caller) ;; Use contract-caller so market-pool can withdraw its own funds
      (current-total-deposits (var-get total-deposits))
      (current-total-shares (ft-get-supply z-usdc))
      (owner-shares (ft-get-balance z-usdc owner))
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
      (var-set last-yield-update block-height)

      ;; Burn zUSDC shares
      (try! (ft-burn? z-usdc amount owner))

      ;; Transfer USDC back to user
      (try! (as-contract (contract-call? .usdcx transfer usdc-out tx-sender owner none)))

      (print {event: "withdraw", withdrawer: caller, owner: owner, shares-burned: amount, usdc-returned: usdc-out})
      (ok usdc-out)
    )
  )
)

;; Harvest Yield - Collect and distribute earned yield
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

          ;; Mint new zUSDC shares to distribute yield proportionally to all holders
          ;; Yield is distributed as additional shares (reinvesting)
          (try! (ft-mint? z-usdc yield-earned CONTRACT-OWNER))

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

;; Read-only: Get pending yield for a specific user
;; Calculated based on their share of the vault
(define-read-only (get-pending-yield (who principal))
  (let
    (
      (user-shares (ft-get-balance z-usdc who))
      (total-shares (ft-get-supply z-usdc))
      (deposits (var-get total-deposits))
    )
    (if (or (is-eq total-shares u0) (is-eq user-shares u0))
      (ok u0)
      (ok (/ (* user-shares deposits) total-shares))
    )
  )
)

;; Read-only: Get APY (Annual Percentage Yield) based on current yield rate
(define-read-only (get-apy)
  (ok (var-get yield-rate-bp)))

;; Read-only: Get user's effective balance (shares * price per share)
(define-read-only (get-effective-balance (who principal))
  (let
    (
      (user-shares (ft-get-balance z-usdc who))
      (total-shares (ft-get-supply z-usdc))
      (deposits (var-get total-deposits))
    )
    (if (or (is-eq total-shares u0) (is-eq user-shares u0))
      (ok u0)
      (ok (/ (* user-shares deposits) total-shares))
    )
  )
)

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
    (try! (ft-mint? z-usdc amount recipient))
    (print {event: "mint", recipient: recipient, amount: amount})
    (ok true)
  )
)

;; Admin: Burn tokens (for testing)
(define-public (burn (amount uint))
  (let
    (
      (caller tx-sender)
      (balance (ft-get-balance z-usdc caller))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= balance amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? z-usdc amount caller))
    (print {event: "burn", burner: caller, amount: amount})
    (ok true)
  )
)
