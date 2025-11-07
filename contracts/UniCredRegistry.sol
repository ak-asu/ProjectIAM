// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IUniCredRegistry.sol";

/**
 * Uses Privado ID state roots for claim verification
 * Role-based access: admin, universities
 * Works with Privado ID Issuer Node for creating merklized credentials
 * Works with Privado ID Verifier SDK for off-chain proof verification
 * Provides on-chain proof of credential authenticity and revocation status
 * public - Anyone can call/see
 * external - Only external callers (not internal functions)
 * internal - Only this contract and child contracts
 * private - Only this contract
 */
contract UniCredRegistry is IUniCredRegistry {
    // STATE VARIABLES
    address public admin;
    mapping(bytes32 => Credential) private creds;
    mapping(string => Issuer) private issuers;
    mapping(string => bytes32[]) private holderCreds;
    mapping(string => bytes32[]) private issuerIssuedCreds;
    mapping(address => string) private issuerAdressToDID; // for auth checks
    uint256 private credCounter; // Counter for generating incremental unique credential IDs

    // MODIFIERS are security checkpoints that runs before the function.
    modifier onlyAdmin() {
        // msg.sender returns whoever called the function
        require(msg.sender == admin, "UniCredRegistry: Caller is not admin");
        _;
    }

    // Registered and active issuers
    modifier onlyIssuer() {
        string memory issuerDID = issuerAdressToDID[msg.sender];
        require(
            bytes(issuerDID).length > 0,
            "UniCredRegistry: Not a registered issuer"
        );
        require(
            issuers[issuerDID].isActive,
            "UniCredRegistry: Issuer is not active"
        );
        _;
    }

    modifier credExists(bytes32 credId) {
        require(
            creds[credId].issuedAt > 0,
            "UniCredRegistry: Credential does not exist"
        );
        _;
    }

    // Runs once when contract is deployed for initialization
    constructor() {
        admin = msg.sender;
        credCounter = 0;
    }

    // merkleRoot comes from Privado ID Issuer Node after merklizing the claims
    function issueCredential(
        string calldata holderDID,
        bytes32 credHash,
        bytes32 merkleRoot,
        string calldata ipfsCID,
        uint256 expiresAt
    ) external onlyIssuer returns (bytes32 credId) {
        // Input validation
        require(
            bytes(holderDID).length > 0,
            "UniCredRegistry: Holder DID cannot be empty"
        );
        require(
            credHash != bytes32(0),
            "UniCredRegistry: Credential hash cannot be zero"
        );
        require(
            merkleRoot != bytes32(0),
            "UniCredRegistry: Merkle root cannot be zero"
        );
        require(
            bytes(ipfsCID).length > 0,
            "UniCredRegistry: IPFS CID cannot be empty"
        );
        // If expiration is set, ensure it's in the future
        if (expiresAt > 0) {
            require(
                expiresAt > block.timestamp,
                "UniCredRegistry: Expiration must be in future"
            );
        }
        // Get issuer DID from caller address
        string memory issuerDID = issuerAdressToDID[msg.sender];
        // Generate unique credential ID
        credCounter++;
        credId = keccak256(
            // Hash function to create unique fingerprint
            abi.encodePacked(
                // Combines multiple values into one
                issuerDID,
                holderDID,
                credHash,
                block.timestamp, // Current time on blockchain
                credCounter
            )
        );
        creds[credId] = Credential({
            credId: credId,
            issuerDID: issuerDID,
            holderDID: holderDID,
            credHash: credHash,
            merkleRoot: merkleRoot,
            ipfsCID: ipfsCID,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            isRevoked: false,
            revocationReason: "",
            revokedAt: 0
        });
        holderCreds[holderDID].push(credId);
        issuerIssuedCreds[issuerDID].push(credId);
        emit CredentialIssued(
            credId,
            issuerDID,
            holderDID,
            credHash,
            merkleRoot,
            block.timestamp
        );
        return credId;
    }

    // Revocation is permanent and Verifiers check the isRevoked flag before trusting a credential
    function revokeCredential(
        bytes32 credId,
        string calldata reason
    ) external onlyIssuer credExists(credId) returns (bool success) {
        Credential storage cred = creds[credId];
        string memory callerDID = issuerAdressToDID[msg.sender];
        require(
            keccak256(bytes(cred.issuerDID)) == keccak256(bytes(callerDID)),
            "UniCredRegistry: Only issuer can revoke their credential"
        );
        require(!cred.isRevoked, "UniCredRegistry: Credential already revoked");
        cred.isRevoked = true;
        cred.revocationReason = reason;
        cred.revokedAt = block.timestamp;
        emit CredentialRevoked(credId, msg.sender, reason, block.timestamp);
        return true;
    }

    // Lets issuers update the merkle root when Privado ID publishes a new state.
    // This function syncs our on-chain merkle root with the Issuer Node and is used
    // when claims have been modified or re-merklized
    function updateMerkleRoot(
        bytes32 credId,
        bytes32 newMerkleRoot
    ) external onlyIssuer credExists(credId) returns (bool success) {
        Credential storage cred = creds[credId];
        string memory callerDID = issuerAdressToDID[msg.sender];
        require(
            keccak256(bytes(cred.issuerDID)) == keccak256(bytes(callerDID)),
            "UniCredRegistry: Only issuer can update merkle root"
        );
        require(
            !cred.isRevoked,
            "UniCredRegistry: Cannot update revoked credential"
        );
        // Validate new merkle root
        require(
            newMerkleRoot != bytes32(0),
            "UniCredRegistry: Merkle root cannot be zero"
        );
        require(
            newMerkleRoot != cred.merkleRoot,
            "UniCredRegistry: Merkle root unchanged"
        );

        bytes32 oldMerkleRoot = cred.merkleRoot;
        cred.merkleRoot = newMerkleRoot;
        emit MerkleRootUpdated(
            credId,
            oldMerkleRoot,
            newMerkleRoot,
            block.timestamp
        );
        return true;
    }

    function getCredential(
        bytes32 credId
    ) external view credExists(credId) returns (Credential memory) {
        return creds[credId];
    }

    // Off-chain verifiers call this first. Then they use Privado ID Verifier SDK for ZK proof
    // verification and afterwards they check the credential hash matches what was presented
    function isCredentialValid(
        bytes32 credId
    ) external view returns (bool isValid, string memory reason) {
        if (creds[credId].issuedAt == 0) {
            return (false, "Credential does not exist");
        }
        Credential memory cred = creds[credId];
        if (cred.isRevoked) {
            return (
                false,
                string(abi.encodePacked("Revoked: ", cred.revocationReason))
            );
        }
        if (cred.expiresAt > 0 && block.timestamp > cred.expiresAt) {
            return (false, "Credential has expired");
        }
        return (true, "");
    }

    function getAllCredentialsByHolder(
        string calldata holderDID
    ) external view returns (bytes32[] memory) {
        return holderCreds[holderDID];
    }

    function getAllCredentialsByIssuer(
        string calldata issuerDID
    ) external view returns (bytes32[] memory) {
        return issuerIssuedCreds[issuerDID];
    }

    // Holder presents their credential whose hash the verifier computes and
    // compares with the on-chain hash to check for tampering.
    // view keyword Only reads blockchain data and doesn't change anything. No keyword
    // changes data and costs gas while pure keyword doesn't even read blockchain
    function verifyCredentialHash(
        bytes32 credId,
        bytes32 providedHash
    ) external view credExists(credId) returns (bool matches) {
        return creds[credId].credHash == providedHash;
    }

    function registerIssuer(
        string calldata issuerDID,
        address issuerAddress,
        string calldata name
    ) external onlyAdmin returns (bool success) {
        // Validate inputs
        require(
            bytes(issuerDID).length > 0,
            "UniCredRegistry: Issuer DID cannot be empty"
        );
        require(
            issuerAddress != address(0),
            "UniCredRegistry: Invalid issuer address"
        );
        require(
            bytes(name).length > 0,
            "UniCredRegistry: Name cannot be empty"
        );
        require(
            issuers[issuerDID].registeredAt == 0,
            "UniCredRegistry: Issuer already registered"
        );
        // Create issuer
        issuers[issuerDID] = Issuer({
            issuerDID: issuerDID,
            issuerAddress: issuerAddress,
            name: name,
            isActive: true,
            registeredAt: block.timestamp
        });
        issuerAdressToDID[issuerAddress] = issuerDID;
        // Emit event
        emit IssuerRegistered(issuerDID, issuerAddress, name);
        return true;
    }

    // Deactivate an issuer but keep existing credentials stay valid
    function deactivateIssuer(string calldata issuerDID) external onlyAdmin {
        require(
            issuers[issuerDID].registeredAt > 0,
            "UniCredRegistry: Issuer does not exist"
        );
        require(
            issuers[issuerDID].isActive,
            "UniCredRegistry: Issuer already inactive"
        );
        issuers[issuerDID].isActive = false;
    }

    // Admin reactivates a deactivated issuer
    function reactivateIssuer(string calldata issuerDID) external onlyAdmin {
        require(
            issuers[issuerDID].registeredAt > 0,
            "UniCredRegistry: Issuer does not exist"
        );
        require(
            !issuers[issuerDID].isActive,
            "UniCredRegistry: Issuer already active"
        );
        issuers[issuerDID].isActive = true;
    }

    function getIssuer(
        string calldata issuerDID
    ) external view returns (Issuer memory) {
        require(
            issuers[issuerDID].registeredAt > 0,
            "UniCredRegistry: Issuer does not exist"
        );
        return issuers[issuerDID];
    }

    function isAuthorizedIssuer(
        address issuerAddress,
        string calldata issuerDID
    ) external view returns (bool isAuthorized) {
        string memory addressDID = issuerAdressToDID[issuerAddress];
        return
            keccak256(bytes(addressDID)) == keccak256(bytes(issuerDID)) &&
            issuers[issuerDID].isActive;
    }

    // Only the current admin transfer admin role to someone else
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(
            newAdmin != address(0),
            "UniCredRegistry: Invalid admin address"
        );
        require(newAdmin != admin, "UniCredRegistry: Same admin address");
        admin = newAdmin;
    }

    function getTotalIssuedCredentials() external view returns (uint256) {
        return credCounter;
    }
}
