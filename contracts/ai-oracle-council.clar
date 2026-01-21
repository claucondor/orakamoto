;; AI Oracle Council Contract for StackPredict Protocol
;; Implements Layer 3: AI Pre-Verification (Advisory Layer)
;; Provides AI-powered recommendations for disputed markets
;;
;; IMPORTANT: AI recommendations are ADVISORY ONLY and have NO voting power
;; The AI layer provides evidence-based analysis to help human voters make informed decisions
;; but cannot override or influence the quadratic voting outcome
;;
;; Architecture:
;; - Multiple AI models (LLMs) evaluate market evidence independently
;; - Recommendations include: outcome, confidence score, supporting evidence sources
;; - Accuracy tracking: Track AI prediction accuracy over time for calibration
;; - Advisory weight: 0 (AI cannot influence voting outcomes)
;;
;; Flow:
;; 1. Anyone can request AI evaluation for a disputed market
;; 2. Authorized AI bridge submits recommendations from multiple models
;; 3. Voters can view AI recommendations when making decisions
;; 4. After resolution, AI accuracy is tracked for future calibration

;; Traits
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant PRECISION u1000000)

;; AI recommendation weight is 0 - advisory only, no voting power
(define-constant AI-RECOMMENDATION-WEIGHT u0)

;; Maximum number of AI models in the council
(define-constant MAX-AI-MODELS u5)

;; Maximum evidence links per evaluation request
(define-constant MAX-EVIDENCE-LINKS u10)

;; Maximum length for evidence descriptions
(define-constant MAX-EVIDENCE-LENGTH u200)

;; Error Constants
(define-constant ERR-NOT-AUTHORIZED (err u1500))
(define-constant ERR-ZERO-AMOUNT (err u1501))
(define-constant ERR-INVALID-OUTCOME (err u1502))
(define-constant ERR-INVALID-CONFIDENCE (err u1503))
(define-constant ERR-MARKET-NOT-FOUND (err u1504))
(define-constant ERR-ALREADY-EVALUATED (err u1505))
(define-constant ERR-NO-RECOMMENDATION (err u1506))
(define-constant ERR-INVALID-EVIDENCE (err u1507))
(define-constant ERR-MAX-MODELS-REACHED (err u1508))
(define-constant ERR-EVIDENCE-TOO-LONG (err u1509))

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; AI Model structure
;; - model-id: Unique identifier for the AI model
;; - model-name: Human-readable name (e.g., "GPT-4", "Claude", "Llama-3")
;; - is-active: Whether the model is currently active
;; - total-predictions: Total number of predictions made
;; - correct-predictions: Number of correct predictions
(define-map ai-models
  uint
  {
    model-id: uint,
    model-name: (string-ascii 50),
    is-active: bool,
    total-predictions: uint,
    correct-predictions: uint
  }
)

;; AI Recommendation structure for a market
;; - market-id: ID of the disputed market
;; - model-id: AI model that made the recommendation
;; - outcome: Recommended outcome (0 = NO, 1 = YES)
;; - confidence: Confidence score (0-1000000 = 0-100%)
;; - evidence-links: List of evidence sources (URLs or references)
;; - timestamp: Block height when recommendation was made
;; - is-correct: Whether the recommendation matched final outcome (null until resolved)
(define-map ai-recommendations
  { market-id: uint, model-id: uint }
  {
    outcome: uint,
    confidence: uint,
    evidence-links: (list 10 (string-ascii 200)),
    timestamp: uint,
    is-correct: (optional bool)
  }
)

;; Market evaluation request structure
;; - market-id: ID of the market being evaluated
;; - question: The question being asked
;; - requested-by: Principal who requested the evaluation
;; - timestamp: Block height when request was made
;; - has-response: Whether AI models have responded
(define-map market-evaluations
  uint
  {
    market-id: uint,
    question: (string-ascii 200),
    requested-by: principal,
    timestamp: uint,
    has-response: bool
  }
)

;; Track model recommendations by market (list of model IDs)
(define-map market-models
  uint
  (list 5 uint)
)

;; Sequential model ID counter
(define-data-var model-id-counter uint u0)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get AI model information
(define-read-only (get-ai-model (model-id uint))
  (ok (map-get? ai-models model-id))
)

;; Get all active AI models
(define-read-only (get-active-models)
  (let
    (
      (model-ids (list u0 u1 u2 u3 u4))
    )
    (ok
      (filter is-model-active model-ids)
    )
  )
)

;; Check if a model is active
(define-read-only (is-model-active (model-id uint))
  (match (map-get? ai-models model-id)
    model
    (get is-active model)
    false
  )
)

;; Get AI recommendation for a market from a specific model
(define-read-only (get-model-recommendation (market-id uint) (model-id uint))
  (ok (map-get? ai-recommendations { market-id: market-id, model-id: model-id }))
)

;; Get all AI recommendations for a market
(define-read-only (get-market-recommendations (market-id uint))
  (let
    (
      (model-ids (default-to (list) (map-get? market-models market-id)))
    )
    (ok
      (map get-model-recommendation-helper model-ids (list market-id market-id market-id market-id market-id))
    )
  )
)

;; Helper function for get-market-recommendations
(define-private (get-model-recommendation-helper (model-id uint) (market-id uint))
  (map-get? ai-recommendations { market-id: market-id, model-id: model-id })
)

;; Get aggregated AI recommendation for a market
;; Returns: { outcome: optional uint, avg-confidence: uint, model-count: uint }
(define-read-only (get-ai-recommendation (market-id uint))
  (let
    (
      (recommendations-result (get-market-recommendations market-id))
      (model-ids (default-to (list) (map-get? market-models market-id)))
      (model-count (len model-ids))
    )
    (match recommendations-result
      recs
      (let
        (
          ;; Filter out none values and extract data
          (valid-recs (filter is-some recs))
          (confidence-sum (fold + (map get-confidence-from-optional valid-recs) u0))
          (outcome-0-count (fold + (map count-outcome-0 valid-recs) u0))
          (outcome-1-count (fold + (map count-outcome-1 valid-recs) u0))
          (avg-confidence (if (> (len valid-recs) u0)
                            (/ confidence-sum (to-uint (len valid-recs)))
                            u0
                          ))
          (majority-outcome (if (> outcome-1-count outcome-0-count)
                              (some u1)
                              (if (> outcome-0-count outcome-1-count)
                                (some u0)
                                none
                              )
                            ))
        )
        (ok {
          outcome: majority-outcome,
          avg-confidence: avg-confidence,
          model-count: (to-uint (len valid-recs))
        })
      )
      err-val
      (ok { outcome: none, avg-confidence: u0, model-count: u0 })
    )
  )
)

;; Helper: Extract confidence from optional recommendation
(define-private (get-confidence-from-optional (rec (optional { outcome: uint, confidence: uint, evidence-links: (list 10 (string-ascii 200)), timestamp: uint, is-correct: (optional bool) })))
  (match rec
    r (get confidence r)
    u0
  )
)

;; Helper: Count outcome 0 (NO)
(define-private (count-outcome-0 (rec (optional { outcome: uint, confidence: uint, evidence-links: (list 10 (string-ascii 200)), timestamp: uint, is-correct: (optional bool) })))
  (match rec
    r (if (is-eq (get outcome r) u0) u1 u0)
    u0
  )
)

;; Helper: Count outcome 1 (YES)
(define-private (count-outcome-1 (rec (optional { outcome: uint, confidence: uint, evidence-links: (list 10 (string-ascii 200)), timestamp: uint, is-correct: (optional bool) })))
  (match rec
    r (if (is-eq (get outcome r) u1) u1 u0)
    u0
  )
)

;; Get market evaluation request
(define-read-only (get-market-evaluation (market-id uint))
  (ok (map-get? market-evaluations market-id))
)

;; Get AI recommendation weight (always 0 - advisory only)
(define-read-only (get-ai-weight)
  (ok AI-RECOMMENDATION-WEIGHT)
)

;; Get model ID counter
(define-read-only (get-model-id-counter)
  (ok (var-get model-id-counter))
)

;; Check if market has AI recommendations
(define-read-only (has-ai-recommendations (market-id uint))
  (let
    (
      (model-ids (default-to (list) (map-get? market-models market-id)))
    )
    (ok (> (len model-ids) u0))
  )
)

;; Get AI accuracy for a model
(define-read-only (get-model-accuracy (model-id uint))
  (match (map-get? ai-models model-id)
    model
    (let
      (
        (total (get total-predictions model))
        (correct (get correct-predictions model))
        (accuracy (if (> total u0)
                    (/ (* correct PRECISION) total)
                    u0
                  ))
      )
      (ok { accuracy: accuracy, total: total, correct: correct })
    )
    (ok { accuracy: u0, total: u0, correct: u0 })
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Request AI evaluation for a market
;; Anyone can call this to request AI analysis of a disputed market
(define-public (request-ai-evaluation
    (market-id uint)
    (question (string-ascii 200))
    (evidence-links (list 10 (string-ascii 200)))
  )
  (let
    (
      (caller tx-sender)
    )
    ;; Validate question is not empty
    (asserts! (> (len question) u0) ERR-ZERO-AMOUNT)

    ;; Check if market already has evaluation request
    (asserts! (is-none (map-get? market-evaluations market-id)) ERR-ALREADY-EVALUATED)

    ;; Create evaluation request
    (map-set market-evaluations
      market-id
      {
        market-id: market-id,
        question: question,
        requested-by: caller,
        timestamp: block-height,
        has-response: false
      }
    )

    (print
      {
        event: "ai-evaluation-requested",
        market-id: market-id,
        question: question,
        requested-by: caller,
        evidence-links: evidence-links,
        timestamp: block-height
      }
    )

    (ok true)
  )
)

;; Record AI recommendation from an authorized AI bridge
;; This is called by the AI bridge after evaluating the market
(define-public (record-ai-recommendation
    (market-id uint)
    (model-id uint)
    (outcome uint)
    (confidence uint)
    (evidence-links (list 10 (string-ascii 200)))
  )
  (let
    (
      (caller contract-caller)
      (evaluation (map-get? market-evaluations market-id))
    )
    ;; Only authorized AI bridge can call this
    ;; In production, this would be a multisig or DAO-authorized bridge
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Validate parameters
    (asserts! (or (is-eq outcome u0) (is-eq outcome u1)) ERR-INVALID-OUTCOME)
    (asserts! (<= confidence PRECISION) ERR-INVALID-CONFIDENCE)
    (asserts! (<= (len evidence-links) MAX-EVIDENCE-LINKS) ERR-INVALID-EVIDENCE)

    ;; Check if market has evaluation request
    (asserts! (is-some evaluation) ERR-MARKET-NOT-FOUND)

    ;; Check if model exists and is active
    (let
      (
        (model (unwrap! (map-get? ai-models model-id) ERR-MARKET-NOT-FOUND))
      )
      (asserts! (get is-active model) ERR-NOT-AUTHORIZED)
    )

    ;; Check if recommendation already exists for this model/market
    (asserts! (is-none (map-get? ai-recommendations { market-id: market-id, model-id: model-id })) ERR-ALREADY-EVALUATED)

    ;; Create recommendation
    (map-set ai-recommendations
      { market-id: market-id, model-id: model-id }
      {
        outcome: outcome,
        confidence: confidence,
        evidence-links: evidence-links,
        timestamp: block-height,
        is-correct: none
      }
    )

    ;; Update market models list
    (let
      (
        (current-models (default-to (list) (map-get? market-models market-id)))
        (new-models (unwrap-panic (as-max-len? (append current-models model-id) u5)))
      )
      (map-set market-models market-id new-models)
    )

    ;; Update evaluation request to mark as having response
    (match evaluation
      eval
      (map-set market-evaluations
        market-id
        (merge eval { has-response: true })
      )
      true
    )

    ;; Update model stats
    (let
      (
        (model (unwrap-panic (map-get? ai-models model-id)))
        (new-total (+ (get total-predictions model) u1))
      )
      (map-set ai-models
        model-id
        (merge model { total-predictions: new-total })
      )
    )

    (print
      {
        event: "ai-recommendation-recorded",
        market-id: market-id,
        model-id: model-id,
        outcome: outcome,
        confidence: confidence,
        evidence-links: evidence-links,
        timestamp: block-height
      }
    )

    (ok true)
  )
)

;; Update AI recommendation accuracy after market resolution
;; Called by quadratic-voting or governance after resolution is finalized
(define-public (update-ai-accuracy
    (market-id uint)
    (winning-outcome uint)
  )
  (let
    (
      (caller contract-caller)
      (model-ids (default-to (list) (map-get? market-models market-id)))
    )
    ;; Only authorized contracts can call this
    (asserts! (or (is-eq caller CONTRACT-OWNER)) ERR-NOT-AUTHORIZED)

    ;; Validate winning outcome
    (asserts! (or (is-eq winning-outcome u0) (is-eq winning-outcome u1)) ERR-INVALID-OUTCOME)

    ;; Update accuracy for each model that made a recommendation
    (map update-model-accuracy-helper model-ids (list market-id market-id market-id market-id market-id) (list winning-outcome winning-outcome winning-outcome winning-outcome winning-outcome))

    (print
      {
        event: "ai-accuracy-updated",
        market-id: market-id,
        winning-outcome: winning-outcome,
        model-count: (len model-ids)
      }
    )

    (ok true)
  )
)

;; Helper function to update model accuracy
(define-private (update-model-accuracy-helper (model-id uint) (market-id uint) (winning-outcome uint))
  (let
    (
      (recommendation (map-get? ai-recommendations { market-id: market-id, model-id: model-id }))
    )
    (match recommendation
      rec
      (let
        (
          (model (unwrap-panic (map-get? ai-models model-id)))
          (was-correct (is-eq (get outcome rec) winning-outcome))
          (new-correct (if was-correct
                         (+ (get correct-predictions model) u1)
                         (get correct-predictions model)
                       ))
        )
        ;; Update recommendation with correctness
        (map-set ai-recommendations
          { market-id: market-id, model-id: model-id }
          (merge rec { is-correct: (some was-correct) })
        )

        ;; Update model stats
        (map-set ai-models
          model-id
          (merge model { correct-predictions: new-correct })
        )
      )
      true
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Register a new AI model
(define-public (register-ai-model (model-name (string-ascii 50)))
  (let
    (
      (caller contract-caller)
      (new-model-id (+ (var-get model-id-counter) u1))
    )
    ;; Only contract owner can register models
    (asserts! (is-eq caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    ;; Check max models
    (asserts! (< (var-get model-id-counter) MAX-AI-MODELS) ERR-MAX-MODELS-REACHED)

    ;; Register model
    (map-set ai-models
      new-model-id
      {
        model-id: new-model-id,
        model-name: model-name,
        is-active: true,
        total-predictions: u0,
        correct-predictions: u0
      }
    )

    ;; Update counter
    (var-set model-id-counter new-model-id)

    (print
      {
        event: "ai-model-registered",
        model-id: new-model-id,
        model-name: model-name
      }
    )

    (ok new-model-id)
  )
)

;; Deactivate an AI model (owner only)
(define-public (deactivate-ai-model (model-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (let
      (
        (model (unwrap! (map-get? ai-models model-id) ERR-MARKET-NOT-FOUND))
      )
      (map-set ai-models
        model-id
        (merge model { is-active: false })
      )
    )

    (print
      {
        event: "ai-model-deactivated",
        model-id: model-id
      }
    )

    (ok true)
  )
)

;; Reactivate an AI model (owner only)
(define-public (reactivate-ai-model (model-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (let
      (
        (model (unwrap! (map-get? ai-models model-id) ERR-MARKET-NOT-FOUND))
      )
      (map-set ai-models
        model-id
        (merge model { is-active: true })
      )
    )

    (print
      {
        event: "ai-model-reactivated",
        model-id: model-id
      }
    )

    (ok true)
  )
)

;; Reset AI recommendation for a market (owner only, for testing/correction)
(define-public (reset-ai-recommendation (market-id uint) (model-id uint))
  (begin
    (asserts! (is-eq contract-caller CONTRACT-OWNER) ERR-NOT-AUTHORIZED)

    (map-delete ai-recommendations { market-id: market-id, model-id: model-id })

    (print
      {
        event: "ai-recommendation-reset",
        market-id: market-id,
        model-id: model-id
      }
    )

    (ok true)
  )
)
