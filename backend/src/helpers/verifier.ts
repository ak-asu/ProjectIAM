import * as fs from 'fs';
import * as path from 'path';
import { getBlockchainService } from './blockchain';
import * as snarkjs from 'snarkjs';
import { core } from '@0xpolygonid/js-sdk';

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

interface VerificationKeyData {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

export function verifyIssuerAuth(issuerDID: string, allowedIssuers: string[]): boolean {
  if (!allowedIssuers || allowedIssuers.length === 0) {
    return true;
  }
  return allowedIssuers.includes(issuerDID);
}

export async function checkCredOnChain(credId: string): Promise<{ isValid: boolean; reason: string }> {
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

export async function proofVerification(
  proof: ZKProof,
  verificationKeyPath?: string
): Promise<{ verified: boolean; errors: string[] }> {
  try {
    if (!proof || !proof.proof || !proof.pub_signals || !proof.proof.pi_a || !proof.proof.pi_b || !proof.proof.pi_c) {
      return { verified: false, errors: ['Invalid proof'] };
    }
    const vKeyPath = verificationKeyPath || path.join(__dirname, '../../circuits/credentialAtomicQuerySigV2.json');
    const vKeyContent = fs.readFileSync(vKeyPath, 'utf-8');
    const vKey: VerificationKeyData = JSON.parse(vKeyContent);
    const tempProof = {
      pi_a: proof.proof.pi_a,
      pi_b: proof.proof.pi_b,
      pi_c: proof.proof.pi_c,
      protocol: proof.proof.protocol || 'groth16',
      curve: 'bn128',
    };
    const isValid = await snarkjs.groth16.verify(vKey, proof.pub_signals, tempProof);
    if (!isValid) {
      return { verified: false, errors: ['Cryptographic proof verification failed'] };
    }
    return { verified: true, errors: [] };
  } catch (error: any) {
    return { verified: false, errors: [`Proof verification error: ${error.message}`] };
  }
}

export function claimsFromPubSignals(publicSigs: string[]): Record<string, any> {
  const claims: Record<string, any> = {};
  if (!publicSigs || publicSigs.length === 0) {
    return claims;
  }
  // Polygon ID credentialAtomicQuerySigV2 circuit public signals layout
  // Index 0: 1 if credential is merklized
  // Index 1: holder's identity
  // Index 4: issuer's id
  // Index 5: hash of the claim schema
  // Index 6: index of the claim field being queried
  // Index 7: query operator: 0=noop, 1=eq, 2=lt, 3=gt, 4=in, 5=nin
  // Index 8-71: query comparison values array
  // Index 72: proof generation time
  // Index 74: merkle tree path key for merklized credentials
  // Index 76: verification requester
  if (publicSigs.length > 0) claims.merklized = publicSigs[0] === '1';
  if (publicSigs.length > 1) claims.userID = publicSigs[1];
  if (publicSigs.length > 3) claims.issuerAuthState = publicSigs[3];
  if (publicSigs.length > 4) claims.issuerID = publicSigs[4];
  if (publicSigs.length > 5) claims.claimSchema = publicSigs[5];
  if (publicSigs.length > 6) claims.slotIndex = parseInt(publicSigs[6], 10);
  if (publicSigs.length > 7) claims.operator = parseInt(publicSigs[7], 10);
  if (publicSigs.length > 71) claims.value = publicSigs.slice(8, 72);
  if (publicSigs.length > 72) claims.timestamp = publicSigs[72];
  if (publicSigs.length > 73) claims.isRevocationChecked = publicSigs[73] === '1';
  if (publicSigs.length > 74) claims.claimPathKey = publicSigs[74];
  if (publicSigs.length > 75) claims.claimPathNotExists = publicSigs[75] === '1';
  if (publicSigs.length > 76) claims.requestID = publicSigs[76];
  // timestamp detection for varying circuit layouts)
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < publicSigs.length; i++) {
      const val = parseInt(publicSigs[i], 10);
      // value is a reasonable timestamp (last 24 hours or next 1 hour)
      if (val > now - 86400 && val < now + 3600) {
          claims.timestamp = publicSigs[i];
          break;
      }
  }
  return claims;
}

export function didFromId(id: string, blockchain = 'polygon', network = 'amoy'): string {
  try {
    const idInt = BigInt(id);
    const coreId = core.Id.fromBigInt(idInt);
    const did = core.DID.parseFromId(coreId);
    return did.string();
  } catch (e) {
    console.warn(`Failed to convert ${id} to DID`, e);
    return `did:iden3:${blockchain}:${network}:${id}`;
  }
}

export function validateProofResp(proofResp: any): boolean {
  if (!proofResp || typeof proofResp !== 'object') {
    return false;
  }
  const required = ['type', 'body', 'from'];
  for (const field of required) {
    if (!(field in proofResp)) {
      return false;
    }
  }
  if (proofResp.type !== 'https://iden3-communication.io/proofs/1.0/response') {
    return false;
  }
  if (!proofResp.body.scope || !Array.isArray(proofResp.body.scope)) {
    return false;
  }
  return true;
}

export async function validatePublicSignals(
  publicSignals: string[],
  expectedRequestID?: string
): Promise<{ valid: boolean; errors: string[] }> {
  if (!publicSignals || publicSignals.length === 0) {
    return { valid: false, errors: ['Public signals array is empty'] };
  }
  const errors: string[] = [];
  const claims = claimsFromPubSignals(publicSignals);
  if (!claims.userID) {
    errors.push('User ID not found in public signals');
  }
  if (!claims.issuerID) {
    errors.push('Issuer ID not found in public signals');
  }
  if (expectedRequestID && claims.requestID !== expectedRequestID) {
    errors.push(`ReqID: expected ${expectedRequestID}, got ${claims.requestID}`);
  }
  if (claims.timestamp) {
    const proofTime = parseInt(claims.timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 3600; // 1 hour
    if (now - proofTime > maxAge) {
      errors.push(`Proof timestamp issue, diff of ${now - proofTime}s`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}
