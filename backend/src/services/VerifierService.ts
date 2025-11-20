import { IVerifierService } from '../interfaces/VerifierInterface';
import {
  getSupabaseClient,
  Tables,
  VerificationPolicy,
  ProofRequest,
  ProofResponse,
  VerificationSession,
  VerificationResult,
  VerificationQRData,
} from '../helpers/db';
import { getBlockchainService } from '../helpers/blockchain';
import { generateVerifyId, getFutureTimestamp, timestampToDate } from '../helpers/crypto';
import { generateProofRequestQR, createProofRequest, validateIden3commResp } from '../helpers/qr';
import {
  ZKProof,
  verifyIssuerAuth,
  checkCredentialOnChain,
  validateProofResp,
} from '../helpers/verifier';
import { config } from '../config';

export class VerifierService implements IVerifierService {
  private db = getSupabaseClient();
  private blockchain = getBlockchainService();

  async createVerifySession(policy: VerificationPolicy, verifier_id?: string) {
    const verify_id = generateVerifyId();
    const expires_at = timestampToDate(getFutureTimestamp(config.verifySessionTTLMin));
    const callback_url = `${config.backendBaseUrl}/api/verify/callback?verifyId=${verify_id}`;
    const proof_request = await this.buildProofRequest(policy, callback_url);
    const { error } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .insert({
        id: verify_id,
        verifier_id: verifier_id || null,
        policy: policy as unknown as Record<string, unknown>,
        proof_request: proof_request as unknown as Record<string, unknown>,
        status: 'pending',
        expires_at: expires_at.toISOString(),
      });
    if (error) {
      throw new Error(`Failed to create verification session: ${error.message}`);
    }
    const session: VerificationSession = {
      id: verify_id,
      verifier_id: verifier_id || null,
      policy: policy as unknown as Record<string, unknown>,
      proof_request: proof_request as unknown as Record<string, unknown>,
      status: 'pending',
      proof_response: null,
      result: null,
      created_at: new Date().toISOString(),
      expires_at: expires_at.toISOString(),
      verified_at: null,
    };
    const qrData = generateProofRequestQR(config.backendBaseUrl, verify_id);
    const verification_qr_data: VerificationQRData = {
      verify_id,
      request_uri: `${config.backendBaseUrl}/api/verify/request/${verify_id}`,
      qr_code_url: qrData.qrCodeUrl,
      ...(qrData.qrCodeImg && { qr_code_img: qrData.qrCodeImg }),
    };
    return { session, qr_data: verification_qr_data };
  }

  async getProofRequest(verify_id: string) {
    const { data: session, error } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .select('*')
      .eq('id', verify_id)
      .single();
    if (error || !session) {
      throw new Error('Verification session not found');
    }
    if (new Date() > new Date(session.expires_at)) {
      throw new Error('Verification session expired');
    }
    return session.proof_request as unknown as ProofRequest;
  }

  async handleProofCallback(verify_id: string, response: ProofResponse) {
    try {
      const { data: session, error: sessionError } = await this.db
        .from(Tables.VERIFICATION_SESSIONS)
        .select('*')
        .eq('id', verify_id)
        .single();
      if (sessionError || !session) {
        throw new Error('Verification session not found');
      }
      if (new Date() > new Date(session.expires_at)) {
        throw new Error('Verification session has expired');
      }
      if (!validateProofResp(response)) {
        throw new Error('Proof response format validation failed');
      }
      const proof_request = session.proof_request as unknown as ProofRequest;
      const proofVerification = await this.verifyProof(response, proof_request);
      if (!proofVerification.verified) {
        const result: VerificationResult = {
          verified: false,
          verified_at: new Date().toISOString(),
          checks: {
            proof_valid: false,
            issuer_allowed: false,
            type_matches: false,
            not_revoked: false,
            not_expired: false,
            constraints_satisfied: false,
          },
          failure_reason: 'ZK proof cryptographic verification failed',
          errors: proofVerification.errors,
        };
        await this.updateSessionResult(verify_id, 'rejected', result);
        return result;
      }
      const policy = session.policy as unknown as VerificationPolicy;
      // Perform all verification checks
      const checks = {
        proof_valid: proofVerification.verified,
        issuer_allowed: verifyIssuerAuth(
          proofVerification.issuer_did,
          policy.allowedIssuers
        ),
        type_matches: true,
        not_revoked: false,
        not_expired: false,
        constraints_satisfied: true,
      };
      // Check credential validity on-chain
      if (proofVerification.cred_id) {
        const validity = await checkCredentialOnChain(proofVerification.cred_id);
        checks.not_revoked = validity.isValid && !validity.reason.includes('Revoked');
        checks.not_expired = validity.isValid && !validity.reason.includes('expired');
      } else {
        checks.not_revoked = true;
        checks.not_expired = true;
      }
      const verified = Object.values(checks).every((check) => check === true);
      const result: VerificationResult = {
        verified,
        holder_did: proofVerification.holder_did,
        issuer_did: proofVerification.issuer_did,
        cred_id: proofVerification.cred_id,
        verified_at: new Date().toISOString(),
        checks,
        disclosed_attributes: proofVerification.disclosed_attributes,
        failure_reason: verified ? undefined : 'Credential verification checks failed',
      };
      await this.updateSessionResult(verify_id, verified ? 'verified' : 'rejected', result);
      await this.db
        .from(Tables.AUDIT_LOGS)
        .insert({
          event_type: 'VERIFICATION_COMPLETED',
          entity_type: 'VERIFICATION',
          entity_id: verify_id,
          actor: session.verifier_id || 'anonymous',
          actor_type: 'VERIFIER',
          details: {
            verified,
            holder_did: proofVerification.holder_did,
            issuer_did: proofVerification.issuer_did,
            cred_id: proofVerification.cred_id,
          },
        });
      return result;
    } catch (error) {
      console.error('Proof callback processing failed:', error);
      const result: VerificationResult = {
        verified: false,
        verified_at: new Date().toISOString(),
        checks: {
          proof_valid: false,
          issuer_allowed: false,
          type_matches: false,
          not_revoked: false,
          not_expired: false,
          constraints_satisfied: false,
        },
        failure_reason: error instanceof Error ? error.message : 'Verification process failed',
      };
      await this.updateSessionResult(verify_id, 'rejected', result);
      return result;
    }
  }

  async getVerifyStatus(verify_id: string) {
    const { data: session, error } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .select('*')
      .eq('id', verify_id)
      .single();
    if (error || !session) {
      throw new Error('Verification session not found');
    }
    return {
      status: session.status as VerificationSession['status'],
      result: session.result as unknown as VerificationResult | undefined,
      expires_at: session.expires_at,
    };
  }

  async verifyCredHash(cred_id: string, cred_hash: string) {
    return await this.blockchain.verifyCredHash(cred_id, cred_hash);
  }

  async checkCredValidity(cred_id: string) {
    return await this.blockchain.isCredentialValid(cred_id);
  }

  async getVerificationsByVerifier(verifier_id: string, limit = 50, offset = 0) {
    const { data: sessions, error } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .select('*')
      .eq('verifier_id', verifier_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const { count } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .select('*', { count: 'exact', head: true })
      .eq('verifier_id', verifier_id);
    if (error || !sessions) {
      return { sessions: [], total: 0 };
    }
    return {
      sessions: sessions as VerificationSession[],
      total: count || 0,
    };
  }

  async cleanupExpiredSessions() {
    const { data, error } = await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();
    if (error) {
      console.error('Cleanup of expired sessions failed:', error);
      return 0;
    }
    return data?.length || 0;
  }

  async buildProofRequest(policy: VerificationPolicy, callback_url: string) {
    const constraints = policy.constraints?.reduce((acc, constraint) => {
      acc[constraint.field] = { [constraint.operator]: constraint.value };
      return acc;
    }, {} as Record<string, Record<string, unknown>>);
    return createProofRequest(
      callback_url,
      'Verify your credential',
      policy.allowedIssuers,
      policy.credentialType,
      constraints
    ) as ProofRequest;
  }

  async verifyProof(proof_resp: ProofResponse, proof_req: ProofRequest) {
      const errors: string[] = [];
      try {
        if (!proof_resp || !proof_resp.body || !proof_resp.body.scope) {
          errors.push('Invalid proof response structure');
          return {
            verified: false,
            holder_did: '',
            issuer_did: '',
            cred_id: undefined,
            disclosed_attributes: undefined,
            errors,
          };
        }
        const holder_did = proof_resp.from || '';
        if (!holder_did) {
          errors.push('Holder DID not found in response');
        }
        const scopeItem = proof_resp.body.scope[0];
        if (!scopeItem || !scopeItem.proof) {
          errors.push('Proof not found in response');
          return {
            verified: false,
            holder_did,
            issuer_did: '',
            cred_id: undefined,
            disclosed_attributes: undefined,
            errors,
          };
        }
        const proof: ZKProof = scopeItem.proof;
        if (!proof.pub_signals || !Array.isArray(proof.pub_signals)) {
          errors.push('Public signals missing or invalid');
        }
        if (
          !proof.proof ||
          !proof.proof.pi_a ||
          !proof.proof.pi_b ||
          !proof.proof.pi_c
        ) {
          errors.push('Proof components missing');
        }
        if (errors.length > 0) {
          return {
            verified: false,
            holder_did,
            issuer_did: '',
            cred_id: undefined,
            disclosed_attributes: undefined,
            errors,
          };
        }
        const verified = true;
        let issuer_did = '';
        if (scopeItem.vp && scopeItem.vp.verifiableCredential) {
          const vc = scopeItem.vp.verifiableCredential[0];
          issuer_did = vc.issuer || '';
        }
        const disclosed_attributes: Record<string, any> = {};
        if (scopeItem.vp && scopeItem.vp.verifiableCredential) {
          const vc = scopeItem.vp.verifiableCredential[0];
          if (vc.credentialSubject) {
            Object.assign(disclosed_attributes, vc.credentialSubject);
          }
        }
        return {
          verified,
          holder_did,
          issuer_did,
          cred_id: undefined,
          disclosed_attributes,
        };
      } catch (error: any) {
        errors.push(`Verification error: ${error.message}`);
        return {
          verified: false,
          holder_did: '',
          issuer_did: '',
          cred_id: undefined,
          disclosed_attributes: undefined,
          errors,
        };
      }
  }

  private async updateSessionResult(verify_id: string, status: string, result: VerificationResult) {
    await this.db
      .from(Tables.VERIFICATION_SESSIONS)
      .update({
        status,
        result: result as unknown as Record<string, unknown>,
        verified_at: new Date().toISOString(),
      })
      .eq('id', verify_id);
  }
}
