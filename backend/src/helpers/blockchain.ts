import { ethers } from 'ethers';
import { config } from '../config';

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract | null = null;
  private signer: ethers.Wallet | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async initializeContract() {
    const abi = [
      'function issueCredential(string calldata holderDID, bytes32 credHash, bytes32 merkleRoot, string calldata ipfsCID, uint256 expiresAt) external returns (bytes32)',
      'function revokeCredential(bytes32 credId, string calldata reason) external returns (bool)',
      'function updateMerkleRoot(bytes32 credId, bytes32 newMerkleRoot) external returns (bool)',
      'function getCredential(bytes32 credId) external view returns (tuple(bytes32 credId, string issuerDID, string holderDID, bytes32 credHash, bytes32 merkleRoot, string ipfsCID, uint256 issuedAt, uint256 expiresAt, bool isRevoked, string revocationReason, uint256 revokedAt))',
      'function isCredentialValid(bytes32 credId) external view returns (bool, string)',
      'function verifyCredentialHash(bytes32 credId, bytes32 providedHash) external view returns (bool)',
      'function getAllCredentialsByHolder(string calldata holderDID) external view returns (bytes32[])',
      'function getAllCredentialsByIssuer(string calldata issuerDID) external view returns (bytes32[])',
      'function registerIssuer(string calldata issuerDID, address issuerAddress, string calldata name) external returns (bool)',
      'function deactivateIssuer(string calldata issuerDID) external',
      'function reactivateIssuer(string calldata issuerDID) external',
      'function getIssuer(string calldata issuerDID) external view returns (tuple(string issuerDID, address issuerAddress, string name, bool isActive, uint256 registeredAt))',
      'function isAuthorizedIssuer(address issuerAddress, string calldata issuerDID) external view returns (bool)',
      'function transferAdmin(address newAdmin) external',
      'function getTotalIssuedCredentials() external view returns (uint256)',
      'event CredentialIssued(bytes32 indexed credId, string indexed issuerDID, string indexed holderDID, bytes32 credHash, bytes32 merkleRoot, uint256 issuedAt)',
      'event CredentialRevoked(bytes32 indexed credId, address indexed revokedBy, string reason, uint256 revokedAt)',
      'event MerkleRootUpdated(bytes32 indexed credId, bytes32 oldMerkleRoot, bytes32 newMerkleRoot, uint256 updatedAt)',
      'event IssuerRegistered(string indexed issuerDID, address indexed issuerAddress, string name)',
    ];
    if (config.issuerPrivateKey) {
      this.signer = new ethers.Wallet(config.issuerPrivateKey, this.provider);
      this.contract = new ethers.Contract(config.contractAddr, abi, this.signer);
    } else {
      this.contract = new ethers.Contract(config.contractAddr, abi, this.provider);
    }
  }

  getContract() {
    if (!this.contract) {
      throw new Error('Contract not initialized - call initializeContract() first');
    }
    return this.contract;
  }

  async issueCredOnChain(
    holderDID: string,
    credHash: string,
    merkleRoot: string,
    ipfsCID: string,
    expiresAt: number
  ): Promise<{ credId: string; txHash: string }> {
    const contract = this.getContract();
    const tx = await contract.issueCredential(
      holderDID,
      credHash,
      merkleRoot,
      ipfsCID,
      expiresAt
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed?.name === 'CredentialIssued';
      } catch {
        return false;
      }
    });
    if (!event) {
      throw new Error('CredentialIssued event not found in tx receipt');
    }
    const parsedEvent = contract.interface.parseLog(event);
    const credId = parsedEvent?.args[0];
    return {
      credId: credId.toString(),
      txHash: receipt.hash,
    };
  }

  async revokeCredOnChain(
    credId: string,
    reason: string
  ): Promise<{ success: boolean; txHash: string }> {
    const contract = this.getContract();
    const tx = await contract.revokeCredential(credId, reason);
    const receipt = await tx.wait();
    return {
      success: true,
      txHash: receipt.hash,
    };
  }

  async getCredFromChain(credId: string) {
    const contract = this.getContract();
    const cred = await contract.getCredential(credId);
    return {
      credId: cred.credId,
      issuerDID: cred.issuerDID,
      holderDID: cred.holderDID,
      credHash: cred.credHash,
      merkleRoot: cred.merkleRoot,
      ipfsCID: cred.ipfsCID,
      issuedAt: Number(cred.issuedAt),
      expiresAt: Number(cred.expiresAt),
      isRevoked: cred.isRevoked,
      revocationReason: cred.revocationReason,
      revokedAt: Number(cred.revokedAt),
    };
  }

  async isCredentialValid(credId: string) {
    const contract = this.getContract();
    const [isValid, reason] = await contract.isCredentialValid(credId);
    return { isValid, reason };
  }

  async verifyCredHash(credId: string, credHash: string) {
    const contract = this.getContract();
    return await contract.verifyCredentialHash(credId, credHash);
  }

  async getAllCredentialsByHolder(holderDID: string) {
    const contract = this.getContract();
    const credIds = await contract.getAllCredentialsByHolder(holderDID);
    return credIds.map((id: any) => id.toString());
  }

  async registerIssuer(
    issuerDID: string,
    issuerAddress: string,
    name: string
  ): Promise<{ success: boolean; txHash: string }> {
    const contract = this.getContract();
    const tx = await contract.registerIssuer(issuerDID, issuerAddress, name);
    const receipt = await tx.wait();
    return {
      success: true,
      txHash: receipt.hash,
    };
  }

  hashCredential(credentialData: any) {
    const jsonString = JSON.stringify(credentialData);
    return ethers.keccak256(ethers.toUtf8Bytes(jsonString));
  }

  async waitForTransaction(txHash: string, confirmations = 1) {
    return await this.provider.waitForTransaction(txHash, confirmations);
  }

  async getBlockNumber() {
    return await this.provider.getBlockNumber();
  }

  async getGasPrice() {
    return await this.provider.getFeeData().then((data) => data.gasPrice || 0n);
  }
}

let blockchainService: BlockchainService | null = null;

export function getBlockchainService() {
  if (!blockchainService) {
    blockchainService = new BlockchainService();
  }
  return blockchainService;
}

export async function initializeBlockchain() {
  const service = getBlockchainService();
  await service.initializeContract();
  return service;
}
