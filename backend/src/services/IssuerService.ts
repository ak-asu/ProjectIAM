import { IIssuerService } from '../interfaces/IssuerInterface';
import {
  getSupabaseClient,
  Tables,
  PrepareCredentialRequest,
  CredentialSubject,
  CredentialOffer,
  CredentialRecord,
  IssuerNodeCredentialRequest,
} from '../helpers/db';
import { getBlockchainService } from '../helpers/blockchain';
import { getIPFSService } from '../helpers/ipfs';
import { generateOfferQR, createCredOffer } from '../helpers/qr';
import { generateId, dateToTimestamp } from '../helpers/crypto';
import { ethers } from 'ethers';
import { config } from '../config';

export class IssuerService implements IIssuerService {
  private db = getSupabaseClient();
  private blockchain = getBlockchainService();
  private ipfs = getIPFSService();

  async prepareCred(request: PrepareCredentialRequest) {
    let student_id: string;
    let holder_did: string;
    if (request.session_id) {
      const { data: session, error } = await this.db
        .from(Tables.SESSIONS)
        .select('*')
        .eq('id', request.session_id)
        .single();
      if (error || !session || !session.did_verified || !session.student_id) {
        throw new Error('Session invalid or DID not verified');
      }
      student_id = session.student_id;
      holder_did = session.did!;
    } else if (request.student_id) {
      student_id = request.student_id;
      const { data: binding, error } = await this.db
        .from(Tables.DID_BINDINGS)
        .select('did')
        .eq('student_id', student_id)
        .single();
      if (error || !binding) {
        throw new Error('Student DID binding not found - wallet not connected');
      }
      holder_did = binding.did;
    } else {
      throw new Error('Either session_id or student_id required');
    }
    const { data: student, error: studentError } = await this.db
      .from(Tables.USERS)
      .select('*')
      .eq('student_id', student_id)
      .single();
    if (studentError || !student) {
      throw new Error('Student record not found in university database');
    }
    const credential_subject: CredentialSubject = {
      ...request.credential_subject,
      id: holder_did,
    };
    return {
      student_id,
      student_name: student.name,
      holder_did,
      credential_subject,
      schema_url: config.schemaUrl,
    };
  }

  async issueCred(request: PrepareCredentialRequest) {
    try {
      const prepared = await this.prepareCred(request);
      const issuerDID = config.issuerDID;
      const schemaUrl = config.schemaUrl;
      const cred_id = generateId();
      const issuanceDate = new Date().toISOString();
      const expirationDate = request.expiration_date
        ? request.expiration_date.toISOString()
        : null;
      const verifiableCredential = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://schema.iden3.io/core/jsonld/iden3proofs.jsonld',
        ],
        id: `urn:uuid:${cred_id}`,
        type: ['VerifiableCredential', request.credential_type || 'DegreeCredential'],
        issuer: issuerDID,
        issuanceDate,
        expirationDate,
        credentialSubject: prepared.credential_subject,
      };
      const cred_hash = this.blockchain.hashCredential(verifiableCredential);
      // Upload to IPFS (encrypted with holder's DID)
      const ipfs_cid = await this.ipfs.upload(verifiableCredential, true, prepared.holder_did);
      // Call Issuer Node to create merklized credential
      const issuerNodeResponse = await this.callIssuerNode({
        schema: schemaUrl,
        subjectId: prepared.holder_did,
        type: verifiableCredential.type,
        credentialSubject: prepared.credential_subject,
        expiration: expirationDate,
        revocationNonce: Math.floor(Math.random() * 1000000),
        mtpProof: true,
      });
      const merkle_root = issuerNodeResponse.state?.rootOfRoots || ethers.keccak256(ethers.toUtf8Bytes('merkle-root-placeholder'));
      const expires_at_timestamp = request.expiration_date
        ? dateToTimestamp(request.expiration_date)
        : 0;
      // Anchor credential on blockchain
      const blockchainResult = await this.blockchain.issueCredOnChain(
        prepared.holder_did,
        cred_hash,
        merkle_root,
        ipfs_cid,
        expires_at_timestamp
      );
      const { error: insertError } = await this.db
        .from(Tables.CREDENTIAL_RECORDS)
        .insert({
          id: cred_id,
          credential_hash: cred_hash,
          merkle_root: merkle_root,
          tx_hash: blockchainResult.txHash,
          holder_did: prepared.holder_did,
          student_id: prepared.student_id,
          issuer_did: issuerDID,
          credential_type: request.credential_type || 'DegreeCredential',
          schema_url: schemaUrl,
          ipfs_cid: ipfs_cid,
          revocation_nonce: issuerNodeResponse.credential?.proof?.revocationNonce || 0,
          issued_at: new Date().toISOString(),
          expires_at: request.expiration_date?.toISOString() || null,
          is_revoked: false,
          issued_by: 'System',
        });
      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      await this.db
        .from(Tables.AUDIT_LOGS)
        .insert({
          event_type: 'CREDENTIAL_ISSUED',
          entity_type: 'CREDENTIAL',
          entity_id: cred_id,
          actor: issuerDID,
          actor_type: 'ISSUER',
          details: {
            holder_did: prepared.holder_did,
            student_id: prepared.student_id,
            credential_type: request.credential_type,
            tx_hash: blockchainResult.txHash,
          },
        });
      const offerUrl = `${config.backendBaseUrl}/api/issue/offer/${cred_id}`;
      const offerQRData = generateOfferQR(offerUrl);
      return {
        success: true,
        cred_id: blockchainResult.credId,
        tx_hash: blockchainResult.txHash,
        merkle_root,
        ipfs_cid,
        offer_qr_data: {
          qr_code_url: offerQRData.qrCodeUrl,
          offer_url: offerUrl,
        },
      };
    } catch (error) {
      console.error('Credential issuance failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to issue credential',
      };
    }
  }

  async getCredOffer(cred_id: string, holder_did: string) {
    const { data: record, error } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*')
      .eq('id', cred_id)
      .single();
    if (error || !record) {
      throw new Error('Credential not found');
    }
    if (record.holder_did !== holder_did) {
      throw new Error('Credential holder DID mismatch');
    }
    const agentUrl = `${config.issuerNodeBaseUrl}/agent/credentials/${cred_id}`;
    const offer = createCredOffer(agentUrl, [
      {
        id: cred_id,
        type: [record.credential_type],
        schema: record.schema_url,
      },
    ]) as CredentialOffer;
    const qrData = generateOfferQR(agentUrl);
    return {
      offer,
      qr_code_url: qrData.qrCodeUrl,
      qr_code_img: '',
    };
  }

  async revokeCredential(cred_id: string, reason: string, revoked_by: string) {
    try {
      const { data: record, error } = await this.db
        .from(Tables.CREDENTIAL_RECORDS)
        .select('*')
        .eq('id', cred_id)
        .single();
      if (error || !record) {
        return { success: false, error: 'Credential not found' };
      }
      if (record.is_revoked) {
        return { success: false, error: 'Already revoked' };
      }
      const blockchainResult = await this.blockchain.revokeCredOnChain(cred_id, reason);
      const { error: updateError } = await this.db
        .from(Tables.CREDENTIAL_RECORDS)
        .update({
          is_revoked: true,
          revocation_reason: reason,
          revoked_at: new Date().toISOString(),
        })
        .eq('id', cred_id);
      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }
      await this.db
        .from(Tables.AUDIT_LOGS)
        .insert({
          event_type: 'CREDENTIAL_REVOKED',
          entity_type: 'CREDENTIAL',
          entity_id: cred_id,
          actor: revoked_by,
          actor_type: 'ADMIN',
          details: {
            reason,
            tx_hash: blockchainResult.txHash,
          },
        });
      return {
        success: true,
        tx_hash: blockchainResult.txHash,
      };
    } catch (error) {
      console.error('Credential revocation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke credential',
      };
    }
  }

  async getCredential(cred_id: string): Promise<CredentialRecord | null> {
    const { data: record, error } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*')
      .eq('id', cred_id)
      .single();
    if (error || !record) {
      return null;
    }
    return record;
  }

  async getAllCredsByHolder(holder_did: string): Promise<CredentialRecord[]> {
    const { data: records, error } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*')
      .eq('holder_did', holder_did)
      .order('issued_at', { ascending: false });
    if (error || !records) {
      return [];
    }
    return records;
  }

  async getAllCredentials(limit = 50, offset = 0) {
    const { data: records, error } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*')
      .order('issued_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const { count } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*', { count: 'exact', head: true });
    if (error || !records) {
      return { credentials: [], total: 0 };
    }
    return {
      credentials: records,
      total: count || 0,
    };
  }

  async uploadToIPFS(credential: Record<string, unknown>, holder_did: string) {
    const cid = await this.ipfs.upload(credential, true, holder_did);
    return { cid, encrypted: true };
  }

  async fetchFromIPFS(cid: string, holder_did: string) {
    return await this.ipfs.fetch(cid, holder_did);
  }

  async validateCredSchema(credential_type: string, credential_subject: CredentialSubject) {
    const errors: string[] = [];
    if (credential_type === 'DegreeCredential') {
      const required = ['university', 'degree', 'major', 'graduationYear'];
      for (const field of required) {
        if (!(field in credential_subject)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
      if (credential_subject.graduationYear) {
        const year = credential_subject.graduationYear;
        if (year < 1900 || year > new Date().getFullYear() + 10) {
          errors.push('Graduation year out of valid range');
        }
      }
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async callIssuerNode(request: IssuerNodeCredentialRequest) {
    return {
      id: `credential-${Date.now()}`,
      credential: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        id: `urn:uuid:${Date.now()}`,
        type: request.type,
        issuer: config.issuerDID,
        issuanceDate: new Date().toISOString(),
        credentialSubject: request.credentialSubject,
        proof: {
          revocationNonce: request.revocationNonce || 0,
        },
      },
      mtp: {
        existence: true,
        siblings: [],
      },
      state: {
        claimsTreeRoot: ethers.keccak256(ethers.toUtf8Bytes('claims-tree')),
        revocationTreeRoot: ethers.keccak256(ethers.toUtf8Bytes('revocation-tree')),
        rootOfRoots: ethers.keccak256(ethers.toUtf8Bytes('root-of-roots')),
        state: ethers.keccak256(ethers.toUtf8Bytes('state')),
        txId: '0x' + '0'.repeat(64),
      },
    };
  }
}
