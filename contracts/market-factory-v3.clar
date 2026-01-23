;; Market Factory V3 Contract
;; Factory for creating and managing prediction markets with metadata

;; ============================================================================
;; CONSTANTS
;; ============================================================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant DEFAULT-RESOLUTION-WINDOW u1008)
(define-constant MAX-TAGS u10)
(define-constant MAX-TAG-LENGTH u32)
(define-constant MAX-CATEGORY-LENGTH u32)

;; ============================================================================
;; ERROR CONSTANTS
;; ============================================================================

(define-constant ERR-NOT-AUTHORIZED (err u5000))
(define-constant ERR-MARKET-NOT-FOUND (err u5001))
(define-constant ERR-MARKET-ALREADY-FEATURED (err u5002))
(define-constant ERR-MARKET-NOT-FEATURED (err u5003))
(define-constant ERR-MARKET-ALREADY-INACTIVE (err u5004))
(define-constant ERR-INVALID-TAG-COUNT (err u5005))
(define-constant ERR-INVALID-TAG-LENGTH (err u5006))
(define-constant ERR-INVALID-CATEGORY-LENGTH (err u5007))
(define-constant ERR-EMPTY-CATEGORY (err u5008))

;; ============================================================================
;; DATA STRUCTURES
;; ============================================================================

(define-map market-metadata
  uint
  {
    category: (string-utf8 32),
    tags: (list 10 (string-utf8 32)),
    featured: bool,
    active: bool,
    created-at: uint,
  }
)

(define-map category-markets
  (string-utf8 32)
  (list 1000 uint)
)

;; Track featured markets - use a simple counter instead of list manipulation
(define-data-var featured-count uint u0)
(define-map featured-markets-bool
  uint
  bool
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

(define-private (add-to-category (category (string-utf8 32)) (market-id uint))
  (let
    (
      (current-list (default-to (list) (map-get? category-markets category)))
      (list-len (len current-list))
    )
    (asserts! (< list-len u999) ERR-INVALID-TAG-COUNT)
    ;; We know the list won't overflow because we checked length < 999, so appending will give <= 1000
    (map-set category-markets category (unwrap! (as-max-len? (append current-list market-id) u1000) ERR-INVALID-TAG-COUNT))
    true
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

(define-read-only (get-market-metadata (market-id uint))
  (let
    (
      (metadata (map-get? market-metadata market-id))
    )
    (match metadata
      some-metadata
        (ok some-metadata)
      (err ERR-MARKET-NOT-FOUND)
    )
  )
)

(define-read-only (get-markets-by-category (category (string-utf8 32)))
  (ok (default-to (list) (map-get? category-markets category)))
)

(define-read-only (get-featured-markets)
  ;; Return empty list - featured tracking is via is-market-featured
  ;; Frontend can iterate market IDs and check is-market-featured
  (ok (list))
)

(define-read-only (get-featured-count)
  (ok (var-get featured-count))
)

(define-read-only (is-market-featured (market-id uint))
  (let
    (
      (metadata (map-get? market-metadata market-id))
    )
    (match metadata
      some-metadata
        (ok (get featured some-metadata))
      (err ERR-MARKET-NOT-FOUND)
    )
  )
)

(define-read-only (is-market-active (market-id uint))
  (let
    (
      (metadata (map-get? market-metadata market-id))
    )
    (match metadata
      some-metadata
        (ok (get active some-metadata))
      (err ERR-MARKET-NOT-FOUND)
    )
  )
)

(define-read-only (get-market-category (market-id uint))
  (let
    (
      (metadata (map-get? market-metadata market-id))
    )
    (match metadata
      some-metadata
        (ok (get category some-metadata))
      (err ERR-MARKET-NOT-FOUND)
    )
  )
)

(define-read-only (get-market-tags (market-id uint))
  (let
    (
      (metadata (map-get? market-metadata market-id))
    )
    (match metadata
      some-metadata
        (ok (get tags some-metadata))
      (err ERR-MARKET-NOT-FOUND)
    )
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS
;; ============================================================================

(define-public (create-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline (optional uint))
    (initial-liquidity uint)
    (category (string-utf8 32))
    (tags (list 10 (string-utf8 32)))
  )
  (let
    (
      (caller tx-sender)
      (res-deadline (match resolution-deadline rd rd (+ deadline DEFAULT-RESOLUTION-WINDOW)))
    )
    (asserts! (> (len category) u0) ERR-EMPTY-CATEGORY)
    (asserts! (<= (len category) MAX-CATEGORY-LENGTH) ERR-INVALID-CATEGORY-LENGTH)
    (asserts! (<= (len tags) MAX-TAGS) ERR-INVALID-TAG-COUNT)

    (let
      (
        (result (contract-call? .multi-market-pool create-market question deadline res-deadline initial-liquidity))
        (market-id (unwrap! result ERR-MARKET-NOT-FOUND))
      )
      ;; Validate tags inline without interdependent functions
      (let
        (
          (tag1-len (len (default-to u"" (element-at tags u0))))
          (tag2-len (len (default-to u"" (element-at tags u1))))
          (tag3-len (len (default-to u"" (element-at tags u2))))
          (tag4-len (len (default-to u"" (element-at tags u3))))
          (tag5-len (len (default-to u"" (element-at tags u4))))
          (tag6-len (len (default-to u"" (element-at tags u5))))
          (tag7-len (len (default-to u"" (element-at tags u6))))
          (tag8-len (len (default-to u"" (element-at tags u7))))
          (tag9-len (len (default-to u"" (element-at tags u8))))
          (tag10-len (len (default-to u"" (element-at tags u9))))
        )
        (when (> (len tags) u0)
          (asserts! (and (> tag1-len u0) (<= tag1-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u1)
          (asserts! (and (> tag2-len u0) (<= tag2-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u2)
          (asserts! (and (> tag3-len u0) (<= tag3-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u3)
          (asserts! (and (> tag4-len u0) (<= tag4-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u4)
          (asserts! (and (> tag5-len u0) (<= tag5-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u5)
          (asserts! (and (> tag6-len u0) (<= tag6-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u6)
          (asserts! (and (> tag7-len u0) (<= tag7-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u7)
          (asserts! (and (> tag8-len u0) (<= tag8-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u8)
          (asserts! (and (> tag9-len u0) (<= tag9-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
        (when (> (len tags) u9)
          (asserts! (and (> tag10-len u0) (<= tag10-len MAX-TAG-LENGTH)) ERR-INVALID-TAG-LENGTH)
        )
      )

      (map-set market-metadata
        market-id
        {
          category: category,
          tags: tags,
          featured: false,
          active: true,
          created-at: block-height,
        }
      )

      (add-to-category category market-id)

      (print
        {
          event: "market-created-v3",
          market-id: market-id,
          creator: caller,
          question: question,
          category: category,
          tags: tags,
          deadline: deadline,
          resolution-deadline: res-deadline,
          initial-liquidity: initial-liquidity,
        }
      )

      (ok market-id)
    )
  )
)

;; Placeholder for multi-outcome markets
(define-public (create-multi-outcome-market
    (question (string-utf8 256))
    (deadline uint)
    (resolution-deadline (optional uint))
    (initial-liquidity uint)
    (category (string-utf8 32))
    (tags (list 10 (string-utf8 32)))
    (outcome-count uint)
    (outcome-labels (list 10 (string-utf8 32)))
  )
  (err u5009)
)

(define-public (feature-market (market-id uint))
  (let
    (
      (caller contract-caller)
      (metadata (unwrap! (map-get? market-metadata market-id) ERR-MARKET-NOT-FOUND))
      (current-count (var-get featured-count))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (not (get featured metadata)) ERR-MARKET-ALREADY-FEATURED)
    (asserts! (< current-count u100) ERR-INVALID-TAG-COUNT)

    (map-set market-metadata
      market-id
      (merge metadata { featured: true })
    )

    (var-set featured-count (+ current-count u1))
    (map-set featured-markets-bool market-id true)

    (print
      {
        event: "market-featured",
        market-id: market-id,
        featured-by: caller,
      }
    )

    (ok true)
  )
)

(define-public (unfeature-market (market-id uint))
  (let
    (
      (caller contract-caller)
      (metadata (unwrap! (map-get? market-metadata market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (get featured metadata) ERR-MARKET-NOT-FEATURED)

    (map-set market-metadata
      market-id
      (merge metadata { featured: false })
    )

    (var-set featured-count (- (var-get featured-count) u1))
    (map-set featured-markets-bool market-id false)

    (print
      {
        event: "market-unfeatured",
        market-id: market-id,
        unfeatured-by: caller,
      }
    )

    (ok true)
  )
)

(define-public (deactivate-market (market-id uint))
  (let
    (
      (caller contract-caller)
      (metadata (unwrap! (map-get? market-metadata market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (get active metadata) ERR-MARKET-ALREADY-INACTIVE)

    (map-set market-metadata
      market-id
      (merge metadata { active: false })
    )

    (print
      {
        event: "market-deactivated",
        market-id: market-id,
        deactivated-by: caller,
      }
    )

    (ok true)
  )
)

(define-public (reactivate-market (market-id uint))
  (let
    (
      (caller contract-caller)
      (metadata (unwrap! (map-get? market-metadata market-id) ERR-MARKET-NOT-FOUND))
    )
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-set market-metadata
      market-id
      (merge metadata { active: true })
    )

    (print
      {
        event: "market-reactivated",
        market-id: market-id,
        reactivated-by: caller,
      }
    )

    (ok true)
  )
)
