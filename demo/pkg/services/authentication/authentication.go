package authentication

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	auth "github.com/iden3/go-iden3-auth/v2"
	"github.com/iden3/iden3comm/v2/protocol"
	"github.com/patrickmn/go-cache"
	"github.com/pkg/errors"
)

var (
	userSessionTracker = cache.New(60*time.Minute, 60*time.Minute)
)

type AuthenticationService struct {
	verifier *auth.Verifier
}

func NewAuthenticationService(verifier *auth.Verifier) *AuthenticationService {
	return &AuthenticationService{
		verifier: verifier,
	}
}

func (a *AuthenticationService) NewAuthenticationRequest(
	serviceURL string,
	issuer string,
) (request protocol.AuthorizationRequestMessage, sessionID string) {
	//nolint:gosec // this is not a security issue
	sessionID = strconv.Itoa(rand.Intn(1000000))
	uri := fmt.Sprintf("%s?sessionId=%s", serviceURL, sessionID)
	request = auth.CreateAuthorizationRequestWithMessage(
		"login to website", "", issuer, uri,
	)
	request.ID = uuid.New().String()
	request.ThreadID = uuid.New().String()
	userSessionTracker.Set(sessionID, request, cache.DefaultExpiration)
	return request, sessionID
}

func (a *AuthenticationService) Verify(ctx context.Context,
	sessionID string, tokenBytes []byte) (string, error) {
	request, found := userSessionTracker.Get(sessionID)
	if !found {
		return "", errors.Errorf("auth request was not found for session ID: %s", sessionID)
	}

	// Check if demo mode is enabled via environment variable
	demoMode := os.Getenv("DEMO_MODE")
	fmt.Printf("[DEBUG] DEMO_MODE environment variable: '%s'\n", demoMode)
	if demoMode == "true" {
		// DEMO MODE: Skip all verification and accept any authentication
		// In demo mode, we don't verify the token at all - just accept it
		// Generate a demo DID for this session using a valid base58-encoded identifier
		// We use a pool of pre-generated valid DIDs to avoid parsing errors
		// These DIDs correspond to dummy contract addresses (0x0000...0001, 0x0000...0002, etc.)
		validDemoDIDs := []string{
			"did:iden3:privado:test:2Skqvp4vnSFtq5bgAXbDs1Fs4AA5QGpRut9mCDfGdm", // From address 0x0000...0001
			"did:iden3:privado:test:2Skqvp4vnSFtruWKUaJKH5BNZfkXMi3VXh81QW4uG3", // From address 0x0000...0002
			"did:iden3:privado:test:2Skqvp4vnSFu3xHdP5R9hRpJcZt7LePaCy5fQuZQby", // From address 0x0000...0003
			"did:iden3:privado:test:2Skqvp4vnSFuCZYrUGSKyCekftFAQh1p8GvtjNLXCm", // From address 0x0000...0004
			"did:iden3:privado:test:2Skqvp4vnSFuLAixxvqw1CVNhJNi2h9B9N6wPbMLUf", // From address 0x0000...0005
		}
		// Use session ID to deterministically select a demo DID
		sessionNum, _ := strconv.Atoi(sessionID)
		userDID := validDemoDIDs[sessionNum%len(validDemoDIDs)]
		fmt.Printf("[DEBUG] DEMO MODE: Generated demo DID: %s (session %s)\n", userDID, sessionID)

		userSessionTracker.Set(sessionID, userDID, cache.DefaultExpiration)
		return userDID, nil
	}
	fmt.Printf("[DEBUG] DEMO MODE is not enabled, proceeding with full verification\n")
	fmt.Printf("[DEBUG] Token being verified: %s\n", string(tokenBytes))

	// PRODUCTION MODE: Full verification
	authResponse, err := a.verifier.FullVerify(
		ctx,
		string(tokenBytes),
		request.(protocol.AuthorizationRequestMessage),
	)
	if err != nil {
		fmt.Printf("[DEBUG] FullVerify error details: %v\n", err)
		fmt.Printf("[DEBUG] This error typically means the wallet's DID network is not configured in SUPPORTED_STATE_CONTRACTS/SUPPORTED_RPC\n")
		return "", errors.Errorf("error verifying token: %v", err)
	}
	fmt.Printf("[DEBUG] FullVerify succeeded, DID from wallet: %s\n", authResponse.From)
	userSessionTracker.Set(sessionID, authResponse.From, cache.DefaultExpiration)
	return authResponse.From, nil
}

func (a *AuthenticationService) AuthenticationRequestStatus(sessionID string) (string, error) {
	session, found := userSessionTracker.Get(sessionID)
	if !found {
		return "", errors.Errorf("session not found: %s", sessionID)
	}
	switch s := session.(type) {
	case string:
		return s, nil
	default:
		return "", errors.Errorf("session didn't pass authentification")
	}
}
