import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract | null = null;
  private signer: ethers.Wallet | null = null;

  constructor() {
    if (!config.rpcUrl) {
      throw new Error('RPC_URL not configured in environment');
    }
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async initializeContract() {
    if (!config.contractAddr) {
      throw new Error('CONTRACT_ADDRESS not configured');
    }
    const abiPath = path.join(
      __dirname,
      '../../../contracts/artifacts/contracts/UniCredRegistry.sol/UniCredRegistry.json'
    );
    let abi;
    if (fs.existsSync(abiPath)) {
      const contractJson = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
      abi = contractJson.abi;
    } else {
      abi = [
        'function issueCredential(string holderDID, bytes32 credHash, bytes32 merkleRoot, string ipfsCID, uint256 expiresAt) external returns (bytes32)',
        'function revokeCredential(bytes32 credId, string reason) external returns (bool)',
        'function getCredential(bytes32 credId) external view returns (tuple(bytes32 credId, string issuerDID, string holderDID, bytes32 credHash, bytes32 merkleRoot, string ipfsCID, uint256 issuedAt, uint256 expiresAt, bool isRevoked, string revocationReason, uint256 revokedAt))',
        'function isCredentialValid(bytes32 credId) external view returns (bool, string)',
        'function verifyCredentialHash(bytes32 credId, bytes32 providedHash) external view returns (bool)',
        'function getAllCredentialsByHolder(string holderDID) external view returns (bytes32[])',
        'function registerIssuer(string issuerDID, address issuerAddress, string name) external returns (bool)',
        'event CredentialIssued(bytes32 indexed credId, string issuerDID, string holderDID, bytes32 credHash, bytes32 merkleRoot, uint256 timestamp)',
        'event CredentialRevoked(bytes32 indexed credId, address indexed revoker, string reason, uint256 timestamp)',
      ];
    }
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

  getProvider() {
    return this.provider;
  }

  getSigner() {
    return this.signer;
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

  async getAllCredsByHolder(holderDID: string) {
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
