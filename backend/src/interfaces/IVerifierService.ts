/**
 * Handles off-chain credential verification using zero-knowledge proofs
 * 1. Verifier creates a verification session with their policy
 * 2. Generate an iden3comm proof request QR code
 * 3. Student scans QR with Privado Wallet
 * 4. Wallet generates a zero-knowledge proof satisfying the policy
 * 5. Wallet sends proof to callback URL
 * 6. Verify proof using Privado ID Verifier SDK
 * 7. Check credential validity (not revoked or expired)
 * 8. Return verification result
 */

export interface VerificationConstraint {
  field: string; // like "credentialSubject.university"
  operator: '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin';
  value: any;
}

export interface VerificationPolicy {
  allowedIssuers: string[];
  credentialType: string;
  schemaUrl?: string;
  constraints?: VerificationConstraint[];
  selectiveDisclosure?: {
    revealFields?: string[];
    hideFields?: string[];
  };
  customRules?: Record<string, any>;
}

// Proof request in iden3comm format
export interface ProofRequest {
  type: 'https://iden3-communication.io/proofs/1.0/request';
  body: {
    callbackUrl: string;
    reason: string;
    scope: Array<{
      id: number;
      circuitId: string;
      query: {
        allowedIssuers: string[];
        context: string;
        type: string;
        credentialSubject?: Record<string, any>;
      };
    }>;
  };
}

// Proof response from the wallet
export interface ProofResponse {
  from: string;
  id: string;
  typ: 'application/iden3comm-plain-json';
  type: 'https://iden3-communication.io/proofs/1.0/response';
  body: {
    scope: Array<{
      id: number;
      circuitId: string;
      proof: {
        type: string;
        pub_signals: string[];
        proof: {
          pi_a: string[];
          pi_b: string[][];
          pi_c: string[];
          protocol: string;
        };
      };
      vp?: any; // disclosed credential data
    }>;
  };
}

export interface VerificationSession {
  verifyId: string;
  policy: VerificationPolicy;
  status: 'pending' | 'proof_received' | 'verified' | 'rejected' | 'expired';
  proofResponse?: ProofResponse;
  result?: VerificationResult;
  createdAt: Date;
  expiresAt: Date;
  verifierId?: string;
}

export interface VerificationResult {
  verified: boolean;
  holderDID?: string;
  issuerDID?: string;
  credentialId?: string;
  verifiedAt: Date;
  checks: {
    proofValid: boolean;
    issuerAllowed: boolean;
    typeMatches: boolean;
    notRevoked: boolean;
    notExpired: boolean;
    constraintsSatisfied: boolean;
  };
  disclosedAttributes?: Record<string, any>;
  failureReason?: string;
  errors?: string[];
}

export interface VerificationQRData {
  verifyId: string;
  requestUri: string;
  qrCodeUrl: string;
  qrCodeImage?: string;
}

export interface IVerifierService {
  // Generates a new verification session proof request QR code based on the verification policy.
  createVerificationSession(policy: VerificationPolicy, verifierId?: string): Promise<{
    session: VerificationSession;
    qrData: VerificationQRData;
  }>;
  // Called by Privado Wallet when the QR code is scanned.
  getProofRequest(verifyId: string): Promise<ProofRequest>;
  /**
   * Handle the proof callback from the wallet and performs complete verification of the zero-knowledge proof.
   * Security checks:
   * - Proof signature validation
   * - Nonce/timestamp validation (prevents replay)
   * - State root freshness
   * - Issuer authorization
   * - Revocation status
   * - Expiration check
   */
  handleProofCallback(verifyId: string, response: ProofResponse): Promise<VerificationResult>;
  // Get the status of a verification session and used by frontend to poll for verification progress.
  getVerificationStatus(verifyId: string): Promise<{
    status: VerificationSession['status'];
    result?: VerificationResult;
    expiresAt: Date;
  }>;
  // Verify a credential hash against the blockchain
  verifyCredentialHash(credentialId: string, credentialHash: string): Promise<boolean>;
  checkCredentialValidity(credentialId: string): Promise<{
    isValid: boolean;
    reason: string;
  }>;
  getVerificationsByVerifier(verifierId: string, limit?: number, offset?: number): Promise<{
    sessions: VerificationSession[];
    total: number;
  }>;
  // Clean up expired verification sessions by running periodically via cron job.
  cleanupExpiredSessions(): Promise<number>;
  buildProofRequest(policy: VerificationPolicy, callbackUrl: string): Promise<ProofRequest>;
  // Verify a zero-knowledge proof using Privado ID Verifier SDK.
  verifyProof(proofResponse: ProofResponse, proofRequest: ProofRequest): Promise<{
    verified: boolean;
    holderDID: string;
    issuerDID: string;
    credentialId?: string;
    disclosedAttributes?: Record<string, any>;
    errors?: string[];
  }>;
}
