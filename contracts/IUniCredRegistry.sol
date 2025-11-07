// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * States the main functions for our system including credential issuance, revocation and
 * verification on the Polygon blockchain. This contract works with Privado ID (Polygon ID)
 * for decentralized identity management. We store minimal credential metadata on-chain
 * for lower gas costs while the full data lives off-chain on IPFS.
 * Use storage for permanent data, memory for temporary variables, calldata for function inputs (cheapest)
 */
interface IUniCredRegistry {
    // Events are like notifications or receipts that the blockchain creates when
    // something happens.

    // Fired when a new credential is issued
    // Max 3 indexed parameters per event to make searching easier
    // issuerDID, University DID
    // holderDID, Student DID
    // merkleRoot, merkle root from Privado ID Issuer Node
    event CredentialIssued(
        bytes32 indexed credId,
        string indexed issuerDID,
        string indexed holderDID,
        bytes32 credHash,
        bytes32 merkleRoot,
        uint256 issuedAt
    );

    // Fired when a credential is revoked
    event CredentialRevoked(
        bytes32 indexed credId,
        address indexed revokedBy,
        string reason,
        uint256 revokedAt
    );

    // Fired when a credential's merkle root gets updated
    event MerkleRootUpdated(
        bytes32 indexed credId,
        bytes32 oldMerkleRoot,
        bytes32 newMerkleRoot,
        uint256 updatedAt
    );

    // Fired when a university is registered as an issuer
    // issuerAddress, Ethereum address that controls this issuer
    event IssuerRegistered(
        string indexed issuerDID,
        address indexed issuerAddress,
        string name
    );

    struct Credential {
        bytes32 credId;
        string issuerDID;
        string holderDID;
        bytes32 credHash;
        bytes32 merkleRoot;
        string ipfsCID; // full credential location on IPFS
        uint256 issuedAt;
        uint256 expiresAt;
        bool isRevoked;
        string revocationReason;
        uint256 revokedAt;
    }

    struct Issuer {
        string issuerDID;
        address issuerAddress;
        string name;
        bool isActive; // whether they are active/registered and can issue credentials
        uint256 registeredAt;
    }

    // Only registered issuers issue a new credential to a student
    // Returns unique credentialId for the new credential
    function issueCredential(
        string calldata holderDID,
        bytes32 credHash,
        bytes32 merkleRoot,
        string calldata ipfsCID,
        uint256 expiresAt
    ) external returns (bytes32 credId);

    //The issuer who created it can revoke the active credential
    function revokeCredential(
        bytes32 credId,
        string calldata reason
    ) external returns (bool success);

    // Update a credential's merkle root when Privado ID Issuer Node publishes a new state
    // Caller must be the issuer and the credential must exist and not be revoked
    function updateMerkleRoot(
        bytes32 credId,
        bytes32 newMerkleRoot
    ) external returns (bool success);

    // Get the full credential details
    function getCredential(bytes32 credId)
        external
        view
        returns (Credential memory);

    // Return reason if invalid (empty if valid)
    function isCredentialValid(bytes32 credId)
        external
        view
        returns (bool isValid, string memory reason);

    // Returns list of credential IDs for a Student DID
    function getAllCredentialsByHolder(string calldata holderDID)
        external
        view
        returns (bytes32[] memory);

    function getAllCredentialsByIssuer(string calldata issuerDID)
        external
        view
        returns (bytes32[] memory);

    // Verify a credential hash matches what's on-chain to detect tampering.
    // It returns matches Whether the hashes match
    function verifyCredentialHash(
        bytes32 credId,
        bytes32 providedHash
    ) external view returns (bool matches);

    // Contract admin registers a non-registered university as an issuer
    function registerIssuer(
        string calldata issuerDID,
        address issuerAddress,
        string calldata name
    ) external returns (bool success);

    // Admin deactivates an exisitng issuer
    function deactivateIssuer(string calldata issuerDID) external;

    function getIssuer(string calldata issuerDID)
        external
        view
        returns (Issuer memory);

    // Checks if an address can issue for a specific DID
    function isAuthorizedIssuer(
        address issuerAddress,
        string calldata issuerDID
    ) external view returns (bool isAuthorized);
}
