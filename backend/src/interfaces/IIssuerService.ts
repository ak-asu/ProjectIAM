/**
 * Handles on-chain credential issuance using Privado ID
 * 1. Admin prepares a credential for an authenticated student
 * 2. Call Privado ID Issuer Node with the credential data
 * 3. Issuer Node creates a merkle tree and publishes the state root on-chain
 * 4. Generate an offer QR code for the student
 * 5. Student scans QR with Privado Wallet to receive credential
 */

export interface CredentialSubject {
  id: string;
  university: string;
  degree: string;
  major: string;
  graduationYear: number;
  gpa?: number;
  honors?: string;
  [key: string]: any;
}

export interface PrepareCredentialRequest {
  sessionId?: string;
  studentId?: string;
  credentialType: string;
  credentialSubject: CredentialSubject;
  expirationDate?: Date;
}

// Request format for Privado ID Issuer Node /v1/credentials/issue endpoint
export interface IssuerNodeCredentialRequest {
  schema: string;
  subjectId: string;
  type: string[];
  credentialSubject: Record<string, any>;
  expiration?: string | null;
  revocationNonce?: number;
  signatureProof?: boolean;
  mtpProof?: boolean;
}

export interface IssuerNodeCredentialResponse {
  id: string;
  credential: {
    '@context': string[];
    id: string;
    type: string[];
    issuer: string;
    issuanceDate: string;
    credentialSubject: Record<string, any>;
    proof: any;
  };
  mtp: {
    existence: boolean;
    siblings: string[];
  };
  state: {
    claimsTreeRoot: string;
    revocationTreeRoot: string;
    rootOfRoots: string;
    state: string;
    txId?: string;
  };
}

// Credential offer in iden3comm format
export interface CredentialOffer {
  type: 'https://iden3-communication.io/credentials/1.0/offer';
  body: {
    url: string;
    credentials: Array<{
      id: string;
      type: string[];
      schema: string;
      description?: string;
    }>;
  };
}

export interface CredentialIssuanceResult {
  success: boolean;
  credentialId?: string;
  txHash?: string;
  merkleRoot?: string;
  ipfsCID?: string;
  offerQRData?: {
    qrCodeUrl: string;
    qrCodeImage?: string;
    offerUrl: string;
  };
  error?: string;
}

export interface CredentialRecord {
  credentialId: string;
  holderDID: string;
  studentId: string;
  issuerDID: string;
  credentialType: string;
  schemaUrl: string;
  credentialHash: string;
  merkleRoot: string;
  ipfsCID: string;
  revocationNonce: number;
  txHash: string;
  issuedAt: Date;
  expiresAt: Date | null;
  isRevoked: boolean;
  revocationReason?: string;
  authContextId?: string;
}

export interface IIssuerService {
  // Returns a preview for admin approval before issuing a credential.
  prepareCredential(request: PrepareCredentialRequest): Promise<{
    studentId: string;
    studentName: string;
    holderDID: string;
    credentialSubject: CredentialSubject;
    schemaUrl: string;
  }>;
  /**
   * Issue a credential using the on-chain merklized flow
   *
   * Flow:
   * 1. Create merklized credential via Privado ID Issuer Node
   * 2. Encrypt and store full credential on IPFS
   * 3. Anchor credential hash on-chain via smart contract
   * 4. Generate credential offer QR code
   */
  issueCredential(request: PrepareCredentialRequest): Promise<CredentialIssuanceResult>;
  // Generates the iden3comm offer message and QR code.
  getCredentialOffer(credentialId: string, holderDID: string): Promise<{
    offer: CredentialOffer;
    qrCodeUrl: string;
    qrCodeImage: string;
  }>;
  // Marks credential as revoked in both smart contract and Issuer Node.
  revokeCredential(credentialId: string, reason: string, revokedBy: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
  getCredential(credentialId: string): Promise<CredentialRecord | null>;
  getAllCredentialsByHolder(holderDID: string): Promise<CredentialRecord[]>;
  getAllCredentials(limit?: number, offset?: number): Promise<{
    credentials: CredentialRecord[];
    total: number;
  }>;
  // Encrypts the credential using AES-256-GCM before upload.
  uploadToIPFS(credential: any, holderDID: string): Promise<{
    cid: string;
    encrypted: boolean;
  }>;
  fetchFromIPFS(cid: string, holderDID: string): Promise<any>;
  // Ensures credential conforms to expected JSON-LD schema.
  validateCredentialSchema(credentialType: string, credentialSubject: CredentialSubject): Promise<{
    valid: boolean;
    errors?: string[];
  }>;
}
