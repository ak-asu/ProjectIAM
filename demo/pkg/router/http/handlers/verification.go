package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/iden3/go-service-template/pkg/logger"
	"github.com/iden3/go-service-template/pkg/services/verification"
)

// VerificationHandlers handles HTTP requests for credential verification
type VerificationHandlers struct {
	verificationService *verification.VerificationService
}

// NewVerificationHandlers creates a new verification handlers instance
func NewVerificationHandlers(verificationService *verification.VerificationService) VerificationHandlers {
	return VerificationHandlers{
		verificationService: verificationService,
	}
}

// CreateVerificationRequest handles GET /api/v1/verification/request
// This endpoint allows a verifier to create a verification request
//
// Request body (JSON):
//
//	{
//	  "credentialType": "DegreeCredential",
//	  "schemaUrl": "http://172.21.0.1:8000/degree-credential-schema.json",
//	  "query": {
//	    "graduationYear": {"$gt": 2020}  // ZK proof without revealing exact value
//	  },
//	  "disclose": ["name", "degree", "university"]  // Reveal these fields
//	}
//
// Response:
//   - Body: iden3comm authorization request message (to be encoded as QR code)
//   - Header x-id: Session ID for tracking this verification
//
// Example usage:
//
//	Frontend calls this endpoint, gets the response JSON, and displays it as a QR code
//	User scans the QR code with Polygon ID wallet, which generates and sends a ZKP proof
func (h *VerificationHandlers) CreateVerificationRequest(w http.ResponseWriter, r *http.Request) {
	logger.Info("Creating verification request")

	// Parse the verification request from request body
	var verificationReq verification.VerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&verificationReq); err != nil {
		logger.Error("Failed to decode verification request",
			slog.String("error", err.Error()))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if verificationReq.CredentialType == "" {
		logger.Error("credentialType is required")
		http.Error(w, "credentialType is required", http.StatusBadRequest)
		return
	}
	if verificationReq.SchemaURL == "" {
		logger.Error("schemaUrl is required")
		http.Error(w, "schemaUrl is required", http.StatusBadRequest)
		return
	}

	// Generate the verification request (QR code data)
	request, sessionID, err := h.verificationService.CreateVerificationRequest(&verificationReq)
	if err != nil {
		logger.WithError(err).Error("Failed to create verification request")
		http.Error(w, "Failed to create verification request", http.StatusInternalServerError)
		return
	}

	// Set session ID in response header
	// Frontend will use this to poll for verification status
	w.Header().Set("Access-Control-Expose-Headers", "x-id")
	w.Header().Set("x-id", sessionID)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	// Return the verification request as JSON
	// Frontend will encode this as a QR code
	if err := json.NewEncoder(w).Encode(request); err != nil {
		logger.WithError(err).Error("Failed to encode verification request",
			slog.Any("request", request))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	logger.Info("Verification request created successfully",
		slog.String("sessionID", sessionID),
		slog.String("credentialType", verificationReq.CredentialType))
}

// VerificationCallback handles POST /api/v1/verification/callback?sessionId={id}
// This endpoint receives the ZKP proof from the wallet after the user scans the QR code
//
// The Polygon ID wallet automatically:
//  1. Scans the QR code
//  2. Validates it has a matching credential
//  3. Generates a ZKP proof (5-10 seconds)
//  4. POSTs the proof to this callback URL
//
// Request:
//   - Query param: sessionId (from the QR code callback URL)
//   - Body: JWZ token (JSON Web Zero-knowledge) containing the proof
//
// Response:
//   - 200 OK if proof is valid
//   - 401 Unauthorized if proof is invalid
//   - 404 Not Found if session not found
func (h *VerificationHandlers) VerificationCallback(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	fmt.Printf("[VERIFICATION] Callback received for sessionID: %s\n", sessionID)

	if sessionID == "" {
		logger.Error("sessionId query parameter is required")
		http.Error(w, "sessionId query parameter is required", http.StatusBadRequest)
		return
	}

	// Read the JWZ token from request body
	tokenBytes, err := io.ReadAll(r.Body)
	if err != nil {
		logger.WithError(err).Error("Failed to read request body")
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}
	fmt.Printf("[VERIFICATION] Received proof token, length: %d bytes\n", len(tokenBytes))

	// Verify the ZKP proof
	// This performs FULL verification:
	// - Validates JWZ token cryptography
	// - Verifies ZKP proof
	// - Checks GIST root against blockchain
	// - Validates query conditions
	// NO DEMO_MODE bypass - always validates against blockchain
	userDID, err := h.verificationService.VerifyProof(r.Context(), sessionID, tokenBytes)
	if err != nil {
		fmt.Printf("[VERIFICATION] Proof verification FAILED: %v\n", err)
		logger.WithError(err).Error("Failed to verify proof",
			slog.String("sessionID", sessionID))
		http.Error(w, "Proof verification failed", http.StatusUnauthorized)
		return
	}

	fmt.Printf("[VERIFICATION] Proof verified successfully! User DID: %s\n", userDID)

	// Return success response with verified DID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]string{
		"status": "verified",
		"did":    userDID,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.WithError(err).Error("Failed to encode response",
			slog.Any("response", response))
	}

	logger.Info("Verification completed successfully",
		slog.String("sessionID", sessionID),
		slog.String("verifiedDID", userDID))
}

// VerificationStatus handles GET /api/v1/verification/status?id={sessionId}
// This endpoint allows the frontend to poll for verification completion
//
// The frontend:
//  1. Creates verification request and displays QR code
//  2. Polls this endpoint every 2 seconds
//  3. When wallet submits proof, this returns the verified DID
//  4. Frontend shows success message
//
// Request:
//   - Query param: id (session ID from verification request creation)
//
// Response (if completed):
//
//	{
//	  "status": "verified",
//	  "did": "did:iden3:privado:test:..."
//	}
//
// Response (if pending):
//   - 404 Not Found
func (h *VerificationHandlers) VerificationStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("id")
	if sessionID == "" {
		logger.Error("id query parameter is required")
		http.Error(w, "id query parameter is required", http.StatusBadRequest)
		return
	}

	// Check verification status
	verifiedDID, err := h.verificationService.GetVerificationStatus(sessionID)
	if err != nil {
		// Not completed yet or session not found
		logger.WithError(err).Debug("Verification not completed",
			slog.String("sessionID", sessionID))
		http.Error(w, "Verification not completed", http.StatusNotFound)
		return
	}

	// Verification completed - return the verified DID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]string{
		"status": "verified",
		"did":    verifiedDID,
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.WithError(err).Error("Failed to encode response",
			slog.Any("sessionID", sessionID))
	}

	logger.Info("Verification status retrieved",
		slog.String("sessionID", sessionID),
		slog.String("verifiedDID", verifiedDID))
}
