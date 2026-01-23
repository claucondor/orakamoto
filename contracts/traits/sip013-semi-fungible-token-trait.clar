;; SIP-013: Semi-Fungible Token Standard
;; https://github.com/stacksgov/sips/blob/main/sips/sip-013/sip-013-semi-fungible-token-standard.md
;;
;; This is a local copy for devnet development.
;; On mainnet, contracts should use the official SIP-013 trait.
;;
;; Semi-Fungible Tokens (SFTs) combine properties of both fungible and non-fungible tokens:
;; - Multiple token types (token-ids) in a single contract
;; - Each token-id has its own balance tracking
;; - Transferable between principals
;; - Used for LP tokens in multi-market-pool (token-id = market-id)

(define-trait sip013-semi-fungible-token-trait
  (
    ;; Get the balance of a specific token-id for a principal
    ;; @param token-id: uint - The token type identifier
    ;; @param who: principal - The principal to check the balance of
    ;; @returns (response uint uint) - The balance of the token-id for the principal
    (get-balance (uint principal) (response uint uint))

    ;; Get the overall balance (all token-ids) for a principal
    ;; @param who: principal - The principal to check the overall balance of
    ;; @returns (response uint uint) - The sum of all token balances for the principal
    (get-overall-balance (principal) (response uint uint))

    ;; Get the total supply of a specific token-id
    ;; @param token-id: uint - The token type identifier
    ;; @returns (response uint uint) - The total supply of the token-id
    (get-total-supply (uint) (response uint uint))

    ;; Get the overall supply (all token-ids)
    ;; @returns (response uint uint) - The sum of all token supplies
    (get-overall-supply () (response uint uint))

    ;; Get the number of decimal places for a token-id
    ;; @param token-id: uint - The token type identifier
    ;; @returns (response uint uint) - The number of decimals for the token-id
    (get-decimals (uint) (response uint uint))

    ;; Get the URI for token metadata
    ;; @param token-id: uint - The token type identifier
    ;; @returns (response (optional (string-ascii 256)) uint) - Optional URI for token metadata
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))

    ;; Transfer tokens from sender to recipient
    ;; @param token-id: uint - The token type to transfer
    ;; @param amount: uint - Amount of tokens to transfer
    ;; @param sender: principal - The sender of the tokens
    ;; @param recipient: principal - The recipient of the tokens
    ;; @returns (response bool uint) - Returns true on success, error code on failure
    (transfer (uint uint principal principal) (response bool uint))

    ;; Transfer tokens from sender to recipient with memo
    ;; @param token-id: uint - The token type to transfer
    ;; @param amount: uint - Amount of tokens to transfer
    ;; @param sender: principal - The sender of the tokens
    ;; @param recipient: principal - The recipient of the tokens
    ;; @param memo: (buff 34) - Memo attached to the transfer
    ;; @returns (response bool uint) - Returns true on success, error code on failure
    (transfer-memo (uint uint principal principal (buff 34)) (response bool uint))
  )
)
