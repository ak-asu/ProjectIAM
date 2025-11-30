export interface Session {
  id: string;
  did: string | null;
  did_verified: boolean;
  verified_at: string | null;
  student_id: string | null;
  nonce: string;
  created_at: string;
  expires_at: string;
}

export interface CredentialRecord {
  id: string;
  credential_hash: string;
  merkle_root: string;
  tx_hash: string;
  holder_did: string;
  student_id: string;
  issuer_did: string;
  credential_type: string;
  schema_url: string;
  ipfs_cid: string;
  revocation_nonce: number;
  issued_at: string;
  expires_at: string | null;
  is_revoked: boolean;
  revocation_reason: string | null;
  revoked_at: string | null;
  issued_by: string | null;
  status?: 'issued' | 'offered' | 'fetched' | 'accepted' | 'rejected';
  offered_at?: string | null;
  fetched_at?: string | null;
  accepted_at?: string | null;
  rejection_reason?: string | null;
}

export interface VerificationSession {
  id: string;
  verifier_id: string | null;
  policy: Record<string, unknown>;
  proof_request: Record<string, unknown> | null;
  status: 'pending' | 'proof_received' | 'verified' | 'rejected' | 'expired';
  proof_response: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  verified_at: string | null;
}

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

export interface AuthorizationRequest {
  type: 'https://iden3-communication.io/authorization/1.0/request';
  body: {
    callbackUrl: string;
    reason?: string;
    message: string;
    scope: Array<any>;
  };
}

export interface AuthorizationResponse {
  from: string;
  id: string;
  typ: 'application/iden3comm-plain-json';
  type: 'https://iden3-communication.io/authorization/1.0/response';
  body: {
    message: string;
    scope: Array<{
      id: number;
      circuitId: string;
      proof: any;
    }>;
  };
}

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
      vp?: any;
    }>;
  };
}

export interface CredentialOffer {
  id: string;
  typ: 'application/iden3comm-plain-json';
  type: 'https://iden3-communication.io/credentials/1.0/offer';
  thid: string;
  body: {
    url: string;
    credentials: Array<{
      id: string;
      type: string[];
      schema: string;
      description?: string;
    }>;
  };
  from: string;
}

export interface CredentialFetchResponse {
  id: string;
  typ: 'application/iden3comm-plain-json';
  type: 'https://iden3-communication.io/credentials/1.0/fetch-response';
  thid: string;
  body: {
    credential: any;
  };
  from: string;
  to: string;
}

export interface CredentialAcknowledgment {
  id: string;
  typ: 'application/iden3comm-plain-json';
  type: 'https://iden3-communication.io/credentials/1.0/ack' | 'https://iden3-communication.io/credentials/1.0/problem-report';
  thid: string;
  body: {
    status?: 'accepted' | 'rejected';
    description?: string;
  };
  from: string;
}

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

export interface VerificationPolicy {
  allowedIssuers: string[];
  credentialType: string;
  schemaUrl?: string;
  constraints?: {
    field: string;
    operator: '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte' | '$in' | '$nin';
    value: any;
  }[];
  selectiveDisclosure?: {
    revealFields?: string[];
    hideFields?: string[];
  };
  customRules?: Record<string, any>;
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
  disclosed_attributes?: Record<string, any>;
  failure_reason?: string;
  errors?: string[];
}

export interface PrepareCredentialRequest {
  session_id?: string;
  student_id?: string;
  credential_type: string;
  credential_subject: CredentialSubject;
  expiration_date?: string; // ISO 8601
}

export interface CredentialIssuanceResult {
  success: boolean;
  cred_id?: string;
  tx_hash?: string;
  merkle_root?: string;
  ipfs_cid?: string;
  offer_qr_data?: {
    qr_code_url: string;
    qr_code_img?: string;
    offer_url: string;
  };
  error?: string;
}

export interface StudentLinkingRequest {
  session_id: string;
  username: string;
  password: string;
  did: string;
}

export interface StudentLinkingResult {
  success: boolean;
  student_id?: string;
  student_name?: string;
  error?: string;
}

export interface AuthQRData {
  session_id: string;
  request_uri: string;
  qr_code_url: string;
  qr_code_img?: string;
}

export interface VerificationQRData {
  verify_id: string;
  request_uri: string;
  qr_code_url: string;
  qr_code_img?: string;
}

export const Tables = {
  SESSIONS: 'sessions',
  USERS: 'users',
  DID_BINDINGS: 'did_bindings',
  CREDENTIAL_RECORDS: 'credential_records',
  VERIFICATION_SESSIONS: 'verification_sessions',
  AUDIT_LOGS: 'audit_logs',
} as const;
