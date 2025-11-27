export const portal_token = 'portal_token';
export const admin_api_key = 'admin_api_key';
export const student_session_id = 'student_session_id';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface IssuanceResult {
  success: boolean;
  cred_id?: string;
  tx_hash?: string;
  merkle_root?: string;
  ipfs_cid?: string;
  error?: string;
  offer_qr_data?: {
    qr_code_url: string;
    offer_url: string;
  };
}

export interface AuthStartResult {
  sessionId: string;
  qrCodeUrl: string;
}

export interface AuthStatus {
  did_verified: boolean;
  student_linked: boolean;
  did?: string;
  student_id?: string;
  expires_at: string;
}

export interface LinkStudentResult {
  success: boolean;
  error?: string;
}

export interface PortalLoginResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  expiresAt?: string;
  error?: string;
}

export interface StudentCredential {
  id: string;
  credential_type: string;
  issued_at: string;
  expires_at: string | null;
  is_revoked: boolean;
  ipfs_cid: string | null;
}

export interface VerificationSession {
  id: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  result: VerificationResult | null;
}

export interface VerificationResult {
  verified: boolean;
  holder_did?: string;
  issuer_did?: string;
  cred_id?: string;
  verified_at: string;
  checks: {
    proof_valid: boolean;
    issuer_allowed: boolean;
    type_matches: boolean;
    not_revoked: boolean;
    not_expired: boolean;
    constraints_satisfied: boolean;
  };
  disclosed_attributes?: Record<string, unknown>;
  failure_reason?: string;
  errors?: string[];
}

export interface CredentialRecord {
  id: string;
  credential_hash: string;
  holder_did: string;
  student_id: string;
  credential_type: string;
  issued_at: string;
  expires_at: string | null;
  is_revoked: boolean;
  revocation_reason: string | null;
}
