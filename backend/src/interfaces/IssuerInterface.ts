// On-chain credential issuance using Privado ID
// Flow: Prepare credential → Call Issuer Node → Merkle tree on-chain → Generate offer QR → Student receives via wallet

import {
  CredentialSubject,
  PrepareCredentialRequest,
  CredentialIssuanceResult,
  CredentialOffer,
  CredentialRecord,
} from '../types';

export interface IssuerInterface {
  prepareCred(request: PrepareCredentialRequest): Promise<{
    student_id: string;
    student_name: string;
    holder_did: string;
    credential_subject: CredentialSubject;
    schema_url: string;
  }>;
  // Creates merklized credential → Stores on IPFS (encrypted) → Anchors on-chain → Generates offer QR
  issueCred(request: PrepareCredentialRequest): Promise<CredentialIssuanceResult>;
  getCredOffer(cred_id: string, holder_did: string): Promise<{
    offer: CredentialOffer;
    qr_code_url: string;
    qr_code_img: string;
  }>;
  // Revokes in both smart contract and Issuer Node
  revokeCredential(cred_id: string, reason: string, revoked_by: string): Promise<{
    success: boolean;
    tx_hash?: string;
    error?: string;
  }>;
  getCredential(cred_id: string): Promise<CredentialRecord | null>;
  getAllCredentialsByHolder(holder_did: string): Promise<CredentialRecord[]>;
  getAllCredentials(limit?: number, offset?: number): Promise<{
    credentials: CredentialRecord[];
    total: number;
  }>;
  validateCredSchema(credential_type: string, credential_subject: CredentialSubject): Promise<{
    valid: boolean;
    errors?: string[];
  }>;
}
