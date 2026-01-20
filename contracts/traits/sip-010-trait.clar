;; SIP-010: Standard Trait Definition for Fungible Tokens
;; https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md
;;
;; This is a local copy for devnet development.
;; On mainnet, contracts should use:
;; (impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-trait sip-010-trait
  (
    ;; Transfer tokens to a recipient
    ;; @param amount: uint - Amount of tokens to transfer
    ;; @param sender: principal - The sender of the tokens
    ;; @param recipient: principal - The recipient of the tokens
    ;; @param memo: optional buff 34 - Optional memo attached to the transfer
    ;; @returns (response bool uint) - Returns true on success, error code on failure
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))

    ;; Get the human-readable name of the token
    ;; @returns (response (string-ascii 32) uint) - The token name
    (get-name () (response (string-ascii 32) uint))

    ;; Get the ticker symbol of the token
    ;; @returns (response (string-ascii 32) uint) - The token symbol
    (get-symbol () (response (string-ascii 32) uint))

    ;; Get the number of decimal places for the token
    ;; @returns (response uint uint) - The number of decimals
    (get-decimals () (response uint uint))

    ;; Get the balance of a principal
    ;; @param owner: principal - The principal to check the balance of
    ;; @returns (response uint uint) - The balance of the principal
    (get-balance (principal) (response uint uint))

    ;; Get the total supply of the token
    ;; @returns (response uint uint) - The total supply
    (get-total-supply () (response uint uint))

    ;; Get the URI for token metadata
    ;; @returns (response (optional (string-utf8 256)) uint) - Optional URI for metadata
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
