package verification

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"strconv"
	"time"

	auth "github.com/iden3/go-iden3-auth/v2"
	"github.com/iden3/iden3comm/v2/protocol"
	"github.com/patrickmn/go-cache"
	"github.com/pkg/errors"
)

var (
	// Cache to store verification sessions (request → verified DID)
	verificationSessionCache = cache.New(60*time.Minute, 60*time.Minute)
)

// VerificationService handles credential verification requests and proof validation
type VerificationService struct {
	verifier           *auth.Verifier // Reuses the same verifier as authentication
	callbackURL        string          // Base callback URL for this service
	verifierDID        string          // The verifier's DID (required in authorization requests)
	jsonLdContextURL   string          // JSON-LD context URL for credential verification
}

// NewVerificationService creates a new verification service
// It reuses the existing auth.Verifier to validate ZKP proofs and check blockchain state
func NewVerificationService(verifier *auth.Verifier, callbackURL, verifierDID, jsonLdContextURL string) *VerificationService {
	return &VerificationService{
		verifier:         verifier,
		callbackURL:      callbackURL,
		verifierDID:      verifierDID,
		jsonLdContextURL: jsonLdContextURL,
	}
}

// VerificationRequest represents a credential verification request from a verifier
// The verifier specifies:
// - What type of credential to verify
// - Which fields to query with conditions (ZK proof without revealing values)
// - Which fields to disclose (reveal actual values)
type VerificationRequest struct {
	CredentialType string                 `json:"credentialType"` // e.g., "DegreeCredential"
	SchemaURL      string                 `json:"schemaUrl"`      // e.g., "https://your-ngrok-url.ngrok-free.dev/schemas/degree-credential-schema.json"
	Query          map[string]interface{} `json:"query"`          // Fields with operators, e.g., {"graduationYear": {"$gt": 2020}}
	Disclose       []string               `json:"disclose"`       // Fields to reveal, e.g., ["name", "degree", "university"]
}

// CreateVerificationRequest generates a verification request that will be encoded as a QR code
// The wallet will scan this QR code, generate a ZKP proof, and send it to the callback URL
//
// Parameters:
//   - verificationReq: Specifies what to verify (credential type, query conditions, fields to disclose)
//
// Returns:
//   - request: The iden3comm authorization request message (to be JSON-encoded in QR code)
//   - sessionID: Unique session identifier for tracking this verification
//   - error: Any error during request generation
func (v *VerificationService) CreateVerificationRequest(
	verificationReq *VerificationRequest,
) (request protocol.AuthorizationRequestMessage, sessionID string, error error) {

	// Generate a unique session ID for this verification request
	//nolint:gosec // this is not a security issue, just for demo session tracking
	sessionID = strconv.Itoa(rand.Intn(10000000))

	// Use the configured JSON-LD context URL from environment variable
	// CRITICAL: The ZKP query requires the JSON-LD context URL, not the JSON schema URL
	fmt.Printf("[VERIFICATION] Using configured JSON-LD context URL: %s\n", v.jsonLdContextURL)

	// Build the callback URL with session ID
	// The wallet will POST the ZKP proof to this URL
	callbackURLWithSession := fmt.Sprintf("%s?sessionId=%s", v.callbackURL, sessionID)

	// Build the credential subject query
	// This combines both query conditions (ZK proof) and disclosure requests
	credentialSubject := make(map[string]interface{})

	// Add query conditions (e.g., {"graduationYear": {"$gt": 2020}})
	// These fields will be proven without revealing their actual values
	if len(verificationReq.Query) > 0 {
		for field, condition := range verificationReq.Query {
			credentialSubject[field] = condition
		}
	}

	// Add disclosure requests (e.g., ["name", "degree"])
	// These fields will have their actual values revealed
	// In iden3comm protocol, we request disclosure by including the field with empty object
	if len(verificationReq.Disclose) > 0 {
		for _, field := range verificationReq.Disclose {
			// If field is not already in query, add it for disclosure
			if _, exists := credentialSubject[field]; !exists {
				credentialSubject[field] = map[string]interface{}{} // Empty object means "disclose this field"
			}
		}
	}

	// Create the base authorization request using the helper function
	// This ensures all required fields are properly set
	reason := fmt.Sprintf("Verify your %s credential", verificationReq.CredentialType)
	request = auth.CreateAuthorizationRequest(reason, v.verifierDID, callbackURLWithSession)

	// CRITICAL FIX 1: Set the From field to the verifier's DID
	// This is required for the wallet to know who is requesting verification
	request.From = v.verifierDID

	// CRITICAL FIX 2: In iden3comm protocol, for initial requests, ID and ThreadID must be the same value
	// This is required for proper message threading between wallet request/response flow
	// The CreateAuthorizationRequest function may generate separate UUIDs, so we must sync them
	// Note: The sessionID for tracking this verification is in the callbackURL query parameter
	if request.ID != "" {
		// Use the generated ID for both fields to ensure they match
		request.ThreadID = request.ID
	}

	// Build the ZKP query for the credential
	// This defines what the wallet needs to prove
	zkpQuery := protocol.ZeroKnowledgeProofRequest{
		ID: 1, // Request ID
		// Use MTP (Merkle Tree Proof) circuit for OFF-CHAIN credentials
		// This circuit validates the credential is in the issuer's published merkle tree
		// NOTE: For off-chain verification, use "credentialAtomicQueryMTPV2" (without "OnChain" suffix)
		// "credentialAtomicQueryMTPV2OnChain" is only for on-chain/smart contract verification
		CircuitID: "credentialAtomicQueryMTPV2",
		Query: map[string]interface{}{
			"allowedIssuers": []string{"*"}, // Accept credentials from any issuer (can be restricted to specific DIDs)
			"context":        v.jsonLdContextURL, // CRITICAL: Must use JSON-LD context URL from config, not JSON schema URL
			"type":           verificationReq.CredentialType,
			// Skip revocation check since wallet cannot access local Hardhat blockchain
			// This allows credentials with on-chain status to be verified without blockchain access
			"skipClaimRevocationCheck": true,
		},
	}

	// Add credential subject fields to query if any were specified
	if len(credentialSubject) > 0 {
		zkpQuery.Query["credentialSubject"] = credentialSubject
	}

	// Append the ZKP query to the request scope
	request.Body.Scope = append(request.Body.Scope, zkpQuery)

	// Store the request in cache for later validation in callback
	// When the wallet sends the proof, we'll retrieve this to validate against
	verificationSessionCache.Set(sessionID, request, cache.DefaultExpiration)

	fmt.Printf("[VERIFICATION] Created verification request for session %s\n", sessionID)
	fmt.Printf("[VERIFICATION] Callback URL: %s\n", callbackURLWithSession)
	fmt.Printf("[VERIFICATION] Credential type: %s\n", verificationReq.CredentialType)
	fmt.Printf("[VERIFICATION] Query conditions: %+v\n", verificationReq.Query)
	fmt.Printf("[VERIFICATION] Disclosed fields: %+v\n", verificationReq.Disclose)
	fmt.Printf("[VERIFICATION] Full ZKP Query: %+v\n", zkpQuery.Query)
	fmt.Printf("[VERIFICATION] ZKP Params: %+v\n", zkpQuery.Params)
	fmt.Printf("[VERIFICATION] Request ID: %s\n", request.ID)
	fmt.Printf("[VERIFICATION] Request ThreadID: %s\n", request.ThreadID)
	fmt.Printf("[VERIFICATION] Request From: %s\n", request.From)

	// Print complete request as JSON for debugging
	if requestJSON, err := json.MarshalIndent(request, "", "  "); err == nil {
		fmt.Printf("[VERIFICATION] Complete request JSON:\n%s\n", string(requestJSON))
	}

	return request, sessionID, nil
}

// VerifyProof validates a ZKP proof submitted by the wallet
// This is called when the wallet sends the proof to the callback URL
//
// IMPORTANT: This ALWAYS verifies against blockchain state, even in DEMO_MODE
// DEMO_MODE only affects credential issuance (issuing fake credentials for testing)
// Verification must ALWAYS check:
//   - Cryptographic validity of the ZKP proof
//   - GIST root exists on blockchain
//   - GIST root is fresh (< 15 minutes if replaced)
//   - Credential meets query conditions
//
// Parameters:
//   - ctx: Context for the verification operation
//   - sessionID: Session identifier to retrieve the original verification request
//   - tokenBytes: The JWZ (JSON Web Zero-knowledge) token containing the proof
//
// Returns:
//   - verifiedDID: The DID of the user who submitted the proof (if valid)
//   - error: Any error during proof validation
func (v *VerificationService) VerifyProof(
	ctx context.Context,
	sessionID string,
	tokenBytes []byte,
) (verifiedDID string, error error) {

	fmt.Printf("[VERIFICATION] Verifying proof for session %s\n", sessionID)
	fmt.Printf("[VERIFICATION] Proof token length: %d bytes\n", len(tokenBytes))

	// Retrieve the original verification request from cache
	cachedRequest, found := verificationSessionCache.Get(sessionID)
	if !found {
		return "", errors.Errorf("verification request not found for session ID: %s", sessionID)
	}

	request, ok := cachedRequest.(protocol.AuthorizationRequestMessage)
	if !ok {
		return "", errors.Errorf("invalid request type in cache for session: %s", sessionID)
	}

	// IMPORTANT: NO DEMO_MODE BYPASS HERE
	// Unlike authentication (which can skip for demo), verification MUST always validate:
	// 1. Cryptographic ZKP proof validity
	// 2. GIST root exists on blockchain
	// 3. GIST root freshness (< 15 min if replaced)
	// 4. Credential meets query conditions
	//
	// This ensures that even in demo mode, the verification logic matches the issuing logic:
	// - Credentials are issued to blockchain (real merkle trees, real state)
	// - Verification checks blockchain state (real GIST root validation)

	fmt.Printf("[VERIFICATION] Performing FULL ZKP verification with blockchain state checking\n")

	// Use the auth.Verifier to validate the proof
	// This verifier performs complete validation:
	// 1. Parses and validates JWZ token structure
	// 2. Verifies ZKP cryptographic proof (Groth16)
	// 3. Extracts GIST root from proof public signals
	// 4. Queries blockchain State contract for GIST root
	// 5. Validates GIST root matches and is fresh
	// 6. Verifies query conditions are met
	authResponse, err := v.verifier.FullVerify(
		ctx,
		string(tokenBytes),
		request,
	)
	if err != nil {
		fmt.Printf("[VERIFICATION] FullVerify FAILED: %v\n", err)
		return "", errors.Errorf("proof verification failed: %v", err)
	}

	// Extract the verified DID from the response
	// This is the user's DID who owns the credential
	verifiedDID = authResponse.From
	fmt.Printf("[VERIFICATION] Proof verified successfully!\n")
	fmt.Printf("[VERIFICATION] Verified user DID: %s\n", verifiedDID)

	// Store the verified DID in cache
	// The frontend can poll GetVerificationStatus to check completion
	verificationSessionCache.Set(sessionID, verifiedDID, cache.DefaultExpiration)

	return verifiedDID, nil
}

// GetVerificationStatus checks if a verification has been completed
// This is polled by the frontend to detect when the wallet has submitted a proof
//
// Parameters:
//   - sessionID: Session identifier
//
// Returns:
//   - verifiedDID: The verified user's DID (if verification completed)
//   - error: Error if session not found or verification not yet completed
func (v *VerificationService) GetVerificationStatus(sessionID string) (string, error) {
	session, found := verificationSessionCache.Get(sessionID)
	if !found {
		return "", errors.Errorf("session not found: %s", sessionID)
	}

	// Check if this is a completed verification (DID string) or pending (request object)
	switch s := session.(type) {
	case string:
		// Verification completed - return the verified DID
		fmt.Printf("[VERIFICATION] Session %s completed, verified DID: %s\n", sessionID, s)
		return s, nil
	case protocol.AuthorizationRequestMessage:
		// Still pending - wallet hasn't submitted proof yet
		fmt.Printf("[VERIFICATION] Session %s still pending\n", sessionID)
		return "", errors.Errorf("verification not completed for session: %s", sessionID)
	default:
		return "", errors.Errorf("unexpected session type for session: %s", sessionID)
	}
}
