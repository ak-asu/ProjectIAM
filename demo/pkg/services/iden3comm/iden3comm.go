package iden3comm

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/google/uuid"
	"github.com/iden3/go-iden3-core/v2/w3c"
	"github.com/iden3/go-service-template/pkg/credential"
	"github.com/iden3/go-service-template/pkg/repository"
	"github.com/iden3/go-service-template/pkg/services/issuer"
	"github.com/iden3/iden3comm/v2"
	"github.com/iden3/iden3comm/v2/packers"
	"github.com/iden3/iden3comm/v2/protocol"
	"github.com/pkg/errors"
)

type Iden3commService struct {
	packerManager  *iden3comm.PackageManager
	repository     *repository.CredentialRepository
	issuerService  *issuer.IssuerService
}

func NewIden3commService(
	packerManager *iden3comm.PackageManager,
	credentialRepository *repository.CredentialRepository,
	issuerService *issuer.IssuerService,
) *Iden3commService {
	return &Iden3commService{
		packerManager: packerManager,
		repository:    credentialRepository,
		issuerService: issuerService,
	}
}

func (s *Iden3commService) handleCredentialFetchRequest(ctx context.Context, basicMessage *iden3comm.BasicMessage) ([]byte, error) {
	if basicMessage.To == "" {
		return nil, errors.New("failed request. empty 'to' field")
	}

	if basicMessage.From == "" {
		return nil, errors.New("failed request. empty 'from' field")
	}

	fetchRequestBody := &protocol.CredentialFetchRequestMessageBody{}
	err := json.Unmarshal(basicMessage.Body, fetchRequestBody)
	if err != nil {
		return nil, errors.Wrapf(err, "invalid body")
	}

	// DEMO_MODE: Issue a real credential on-the-fly without requiring user in database
	if os.Getenv("DEMO_MODE") == "true" {
		fmt.Println("[DEBUG] DEMO_MODE enabled - issuing real degree credential on-the-fly")

		issuerDID, err := w3c.ParseDID(basicMessage.To)
		if err != nil {
			return nil, errors.Wrapf(err, "'to' field invalid did '%s'", basicMessage.To)
		}

		// Create credential request for a demo degree
		credRequest := &credential.CredentialRequest{
			CredentialSchema: os.Getenv("NEXT_PUBLIC_DEGREE_SCHEMA_URL"),
			Type:             "DegreeCredential",
			CredentialSubject: map[string]interface{}{
				"id":             basicMessage.From,
				"degree":         "Bachelor of Computer Science",
				"name":           "Demo User",
				"university":     "Demo University",
				"graduationYear": 2024,
			},
			Expiration: 0, // No expiration
		}

		// Issue the credential to the blockchain with valid proofs
		fmt.Println("[DEBUG] Issuing credential to blockchain...")
		credID, err := s.issuerService.IssueCredential(ctx, issuerDID, credRequest)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to issue demo credential")
		}
		fmt.Printf("[DEBUG] Credential issued successfully with ID: %s\n", credID)

		// Retrieve the credential from database
		vc, err := s.issuerService.GetCredentialByID(ctx, issuerDID, credID)
		if err != nil {
			return nil, errors.Wrapf(err, "failed to retrieve issued credential")
		}
		fmt.Println("[DEBUG] Credential retrieved with valid proofs")

		resp, err := json.Marshal(&protocol.CredentialIssuanceMessage{
			ID:       uuid.NewString(),
			Type:     protocol.CredentialIssuanceResponseMessageType,
			ThreadID: basicMessage.ThreadID,
			Body:     protocol.IssuanceMessageBody{Credential: *vc},
			From:     basicMessage.To,
			To:       basicMessage.From,
		})
		if err != nil {
			return nil, errors.Wrapf(err, "failed marshal credential response")
		}
		return resp, nil
	}

	issuerDID, err := w3c.ParseDID(basicMessage.To)
	if err != nil {
		return nil,
			errors.Wrapf(err, "'to' filed invalid did '%s'", basicMessage.To)
	}

	userDID, err := w3c.ParseDID(basicMessage.From)
	if err != nil {
		return nil,
			errors.Wrapf(err, "'from' filed invalid did '%s'", basicMessage.From)
	}

	credential, err := s.repository.GetByID(
		ctx, issuerDID.String(), fetchRequestBody.ID)
	if err != nil {
		return nil,
			errors.Wrapf(err, "failed get claim by claimID '%s'", fetchRequestBody.ID)
	}

	if credential.CredentialSubject["id"] != userDID.String() {
		return nil, errors.New("claim doesn't relate to sender")
	}

	resp, err := json.Marshal(&protocol.CredentialIssuanceMessage{
		ID:       uuid.NewString(),
		Type:     protocol.CredentialIssuanceResponseMessageType,
		ThreadID: basicMessage.ThreadID,
		Body:     protocol.IssuanceMessageBody{Credential: *credential},
		From:     basicMessage.To,
		To:       basicMessage.From,
	})
	if err != nil {
		return nil, errors.Wrapf(err, "failed marshal response")
	}
	return resp, nil
}

func (s *Iden3commService) Handle(ctx context.Context, envelope []byte) ([]byte, error) {
	basicMessage, err := s.packerManager.UnpackWithType(packers.MediaTypeZKPMessage, envelope)
	if err != nil {
		return nil, errors.Errorf("error unpacking message: %v", err)
	}

	var resp []byte
	switch basicMessage.Type {
	case protocol.CredentialFetchRequestMessageType:
		resp, err = s.handleCredentialFetchRequest(ctx, basicMessage)
		if err != nil {
			return nil, errors.Wrapf(err, "failed handling %s request", basicMessage.Type)
		}
	default:
		return nil, errors.Errorf("unknown message type: %s", basicMessage.Type)
	}

	return resp, nil
}
