// Off-chain credential verification using zero-knowledge proofs
// Flow: Create session with policy → Generate proof request QR → Wallet generates ZK proof → Verify proof → Check validity

import {
  VerificationPolicy,
  ProofRequest,
  ProofResponse,
  VerificationSession,
  VerificationResult,
  VerificationQRData,
} from '../types';

export interface VerifierInterface {
  createVerifySession(policy: VerificationPolicy, verifier_id?: string): Promise<{
    session: VerificationSession;
    qr_data: VerificationQRData;
  }>;
  // Called by wallet when QR is scanned
  getProofRequest(verify_id: string): Promise<ProofRequest>;
  // Verifies ZK proof (signature, nonce, state root, issuer auth, revocation, expiration)
  handleProofCallback(verify_id: string, response: ProofResponse): Promise<VerificationResult>;
  // Poll for verification progress
  getVerifyStatus(verify_id: string): Promise<{
    status: VerificationSession['status'];
    result?: VerificationResult;
    expires_at: string;
  }>;
  verifyCredHash(cred_id: string, cred_hash: string): Promise<boolean>;
  checkCredValidity(cred_id: string): Promise<{
    isValid: boolean;
    reason: string;
  }>;
  getVerificationsByVerifier(verifier_id: string, limit?: number, offset?: number): Promise<{
    sessions: VerificationSession[];
    total: number;
  }>;
  cleanupExpiredSessions(): Promise<number>; // Run via cron
  buildProofRequest(policy: VerificationPolicy, callback_url: string): Promise<ProofRequest>;
  verifyProof(proof_resp: ProofResponse, proof_req: ProofRequest): Promise<{
    verified: boolean;
    holder_did: string;
    issuer_did: string;
    cred_id?: string;
    disclosed_attributes?: Record<string, any>;
    errors?: string[];
  }>;
}
