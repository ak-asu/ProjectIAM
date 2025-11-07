package credential

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/google/uuid"
	core "github.com/iden3/go-iden3-core/v2"
	"github.com/iden3/go-iden3-core/v2/w3c"
	"github.com/iden3/go-schema-processor/v2/verifiable"
	"github.com/iden3/go-service-template/pkg/logger"
	"github.com/pkg/errors"
)

type CredentialRequest struct {
	CredentialSchema      string         `json:"credentialSchema"`
	Type                  string         `json:"type"`
	CredentialSubject     map[string]any `json:"credentialSubject"`
	Expiration            int64          `json:"expiration,omitempty"`
	Version               uint32         `json:"version,omitempty"`
	RevNonce              *uint64        `json:"revNonce,omitempty"`
	SubjectPosition       string         `json:"subjectPosition,omitempty"`
	MerklizedRootPosition string         `json:"merklizedRootPosition,omitempty"`
}
type JSONSchemaMetadata struct {
	Metadata struct {
		URIs map[string]string `json:"uris"`
	} `json:"$metadata"`
}

func NewCredential(issuer *w3c.DID, credentialRequest *CredentialRequest, jsonSchemaMetadata JSONSchemaMetadata) (*verifiable.W3CCredential, error) {
	jsonlsSchemaURL, ok := jsonSchemaMetadata.Metadata.URIs["jsonLdContext"]
	if !ok {
		return nil, errors.New("json schema does not contain jsonLdContext")
	}

	var expirationTime *time.Time
	if credentialRequest.Expiration != 0 {
		t := time.Unix(credentialRequest.Expiration, 0).UTC()
		expirationTime = &t
	}
	issuanceTime := time.Now().UTC()

	credentialStatus, err := buildOnchainCredentialStatus(issuer, credentialRequest)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to build onchain credential status")
	}

	credentialRequest.CredentialSubject["type"] = credentialRequest.Type

	return &verifiable.W3CCredential{
		ID: fmt.Sprintf("uri:uuid:%s", uuid.New()),
		Context: []string{
			verifiable.JSONLDSchemaW3CCredential2018,
			verifiable.JSONLDSchemaIden3Credential,
			jsonlsSchemaURL,
		},
		Type: []string{
			verifiable.TypeW3CVerifiableCredential,
			credentialRequest.Type,
		},
		IssuanceDate:      &issuanceTime,
		Expiration:        expirationTime,
		CredentialSubject: credentialRequest.CredentialSubject,
		Issuer:            issuer.String(),
		CredentialSchema: verifiable.CredentialSchema{
			ID:   credentialRequest.CredentialSchema,
			Type: verifiable.JSONSchemaValidator2018,
		},
		CredentialStatus: credentialStatus,
	}, nil
}

func buildOnchainCredentialStatus(issuer *w3c.DID, credentialRequest *CredentialRequest) (*verifiable.CredentialStatus, error) {
	contractAddress, chainID, err := extractContractIdentifier(issuer)
	if err != nil {
		return nil, errors.Wrapf(err, "failed to build contract identifier from did '%s'", issuer)
	}

	revocationNonce := credentialRequest.RevNonce
	if revocationNonce == nil {
		n := uint64(0)
		revocationNonce = &n
	}

	return &verifiable.CredentialStatus{
		ID: fmt.Sprintf(
			"%s/credentialStatus?revocationNonce=%d&contractAddress=%d:%s",
			issuer.String(),
			*revocationNonce,
			chainID,
			contractAddress,
		),
		Type:            verifiable.Iden3OnchainSparseMerkleTreeProof2023,
		RevocationNonce: *revocationNonce,
	}, nil
}

func extractContractIdentifier(did *w3c.DID) (address string, chainID core.ChainID, err error) {
	logger.Debug("Extracting contract identifier from DID", slog.String("did", did.String()))

	id, err := core.IDFromDID(*did)
	if err != nil {
		logger.Error("Failed to parse ID from DID",
			slog.String("did", did.String()),
			slog.String("error", err.Error()))
		return "", 0, errors.Wrapf(err, "failed to get chainID from did '%s'", did.String())
	}
	logger.Debug("Parsed ID from DID", slog.String("id", id.String()))

	contractAddress, err := core.EthAddressFromID(id)
	if err != nil {
		logger.Error("Failed to extract contract address",
			slog.String("did", did.String()),
			slog.String("id", id.String()),
			slog.String("error", err.Error()))
		return "", 0, errors.Wrapf(err, "failed to get contract address from did '%s'", did.String())
	}
	logger.Debug("Extracted contract address", slog.String("address", common.BytesToAddress(contractAddress[:]).Hex()))

	chainID, err = core.ChainIDfromDID(*did)
	if err != nil {
		logger.Error("Failed to extract chain ID",
			slog.String("did", did.String()),
			slog.String("error", err.Error()))
		return "", 0, errors.Wrapf(err, "failed to get chainID from did '%s'", did.String())
	}
	logger.Debug("Extracted chain ID", slog.Int("chainID", int(chainID)))

	return common.BytesToAddress(contractAddress[:]).Hex(), chainID, nil
}
