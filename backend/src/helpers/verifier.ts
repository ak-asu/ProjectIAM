import { getBlockchainService } from './blockchain';

export interface ZKProof {
  type: string;
  pub_signals: string[];
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol?: string;
  };
}

export interface ProofVerificationResult {
  verified: boolean;
  holderDID: string;
  issuerDID: string;
  credId?: string;
  disclosedAttributes?: Record<string, any>;
  errors?: string[];
}

export function verifyIssuerAuth(
  issuerDID: string,
  allowedIssuers: string[]
) {
  if (!allowedIssuers || allowedIssuers.length === 0) {
    return true;
  }
  return allowedIssuers.includes(issuerDID);
}

export async function checkCredentialOnChain(credId: string) {
  try {
    const blockchain = getBlockchainService();
    return await blockchain.isCredentialValid(credId);
  } catch (error: any) {
    return {
      isValid: false,
      reason: `Blockchain check failed: ${error.message}`,
    };
  }
}

export async function verifyCredHash(
  credId: string,
  providedHash: string
) {
  try {
    const blockchain = getBlockchainService();
    return await blockchain.verifyCredHash(credId, providedHash);
  } catch (error: any) {
    console.error('Hash verification error:', error);
    return false;
  }
}

export function extractClaimsFromPublicSignals(publicSignals: string[]) {
  const claims: Record<string, any> = {};
  if (publicSignals.length > 0) {
    claims.userID = publicSignals[0];
  }
  if (publicSignals.length > 1) {
    claims.issuerID = publicSignals[1];
  }
  return claims;
}

export function validateProofReq(proofReq: any) {
  if (!proofReq || typeof proofReq !== 'object') {
    return false;
  }
  const required = ['type', 'body'];
  for (const field of required) {
    if (!(field in proofReq)) {
      return false;
    }
  }
  if (
    proofReq.type !==
    'https://iden3-communication.io/proofs/1.0/request'
  ) {
    return false;
  }
  if (
    !proofReq.body.callbackUrl ||
    !proofReq.body.scope ||
    !Array.isArray(proofReq.body.scope)
  ) {
    return false;
  }
  return true;
}

export function validateProofResp(proofResp: any) {
  if (!proofResp || typeof proofResp !== 'object') {
    return false;
  }
  const required = ['type', 'body', 'from'];
  for (const field of required) {
    if (!(field in proofResp)) {
      return false;
    }
  }
  if (
    proofResp.type !==
    'https://iden3-communication.io/proofs/1.0/response'
  ) {
    return false;
  }
  if (!proofResp.body.scope || !Array.isArray(proofResp.body.scope)) {
    return false;
  }
  return true;
}
