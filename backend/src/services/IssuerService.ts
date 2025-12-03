import { IssuerInterface } from '../interfaces/IssuerInterface';
import {
  getSupabaseClient,
  Tables,
  PrepareCredentialRequest,
  CredentialSubject,
  CredentialOffer,
  CredentialRecord,
} from '../helpers/db';
import { getBlockchainService } from '../helpers/blockchain';
import { getIPFSService } from '../helpers/ipfs';
import { generateOfferQR, createCredOffer, createCredFetchResponse } from '../helpers/qr';
import { dateToTimestamp } from '../helpers/crypto';
import { ethers } from 'ethers';
import { config } from '../config';
import { IssuerSDK } from '../helpers/issuersdk';
import { CredentialStatusType, core } from '@0xpolygonid/js-sdk';
import { didFromId } from '../helpers/verifier';

export class IssuerService implements IssuerInterface {
  private db = getSupabaseClient();
  private blockchain = getBlockchainService();
  private ipfs = getIPFSService();
  private sdk = IssuerSDK.getInstance();

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
    if (holder_did && !holder_did.startsWith('did:')) {
      holder_did = didFromId(holder_did);
    }
    const credential_subject: CredentialSubject = {
      ...request.credential_subject,
      id: holder_did,
      studentId: student_id,
      type: request.credential_type || 'DegreeCredential',
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
      const issuerDID = await this.sdk.initIdentity();
      if (!issuerDID || typeof issuerDID !== 'string' || !issuerDID.startsWith('did:')) {
          throw new Error(`Invalid Issuer DID from SDK: ${issuerDID}`);
      }
      const issuer_did = core.DID.parse(issuerDID);
      const claimReq = {
        credentialSchema: config.schemaUrl,
        type: request.credential_type || 'DegreeCredential',
        credentialSubject: prepared.credential_subject,
        expiration: request.expiration_date ? Math.floor(new Date(request.expiration_date).getTime() / 1000) : undefined,
        revocationOpts: {
          type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
          id: 'https://rhs-staging.polygonid.me'
        }
      };
      const issuedCred = await this.sdk.identityWallet.issueCredential(issuer_did, claimReq);
      // Extract UUID from URN or use the ID as is. issuedCred.id is generally "urn:uuid:...".
      const cred_id_parts = issuedCred.id.split(':');
      const cred_id = cred_id_parts[cred_id_parts.length - 1];
      const mtResult = await this.sdk.identityWallet.addCredentialsToMerkleTree(
        [issuedCred], issuer_did
      );
      // Convert rootOfRoots to BigInt then to 32-byte hex string for the contract
      const rootVal = mtResult.newTreeState.rootOfRoots;
      let rootBigInt: bigint;
      if (typeof rootVal === 'bigint') {
        rootBigInt = rootVal;
      } else if (typeof rootVal === 'object' && rootVal !== null && 'bigInt' in rootVal && typeof (rootVal as any).bigInt === 'function') {
        rootBigInt = (rootVal as any).bigInt();
      } else {
        try {
            rootBigInt = BigInt(rootVal.toString());
        } catch (e) {
            console.error('Failed to convert rootOfRoots to BigInt:', e);
            throw new Error(`Invalid Merkle Root value: ${rootVal}`);
        }
      }      
      const merkle_root = ethers.toBeHex(rootBigInt, 32);
      const oldRootVal = mtResult.oldTreeState.rootOfRoots;
      let oldRootBigInt: bigint;
      if (typeof oldRootVal === 'bigint') {
        oldRootBigInt = oldRootVal;
      } else if (typeof oldRootVal === 'object' && oldRootVal !== null && 'bigInt' in oldRootVal && typeof (oldRootVal as any).bigInt === 'function') {
        oldRootBigInt = (oldRootVal as any).bigInt();
      } else {
        try {
            oldRootBigInt = BigInt(oldRootVal.toString());
        } catch (e) {
            console.warn('Failed to convert oldRootOfRoots to BigInt, assuming 0:', e);
            oldRootBigInt = 0n;
        }
      }
      const isOldStateGenesis = oldRootBigInt === 0n;
      // Publish State to Polygon ID State Contract. makes the credential verifiable by the Privado ID App
      if (config.enableZkProof) {
        try {
          console.log('Starting state transition (ZK Proof generation)...');
          const provider = new ethers.JsonRpcProvider(config.rpcUrl);
          const wallet = new ethers.Wallet(config.issuerPrivateKey, provider);
          // SDK expects an ethers Signer to send the transaction
          const txId = await this.sdk.proofService.transitState(
            issuer_did,
            mtResult.oldTreeState,
            isOldStateGenesis,
            this.sdk.stateStorage,
            wallet as any
          );
          console.log('State transition published:', txId);
        } catch (error) {
          console.warn('Failed to publish ZK Proof', error);
        }
      }
      const cred_hash = this.blockchain.hashCredential(issuedCred);
      const ipfs_cid = await this.ipfs.upload(issuedCred, true, prepared.holder_did);
      const expires_at_timestamp = request.expiration_date
        ? dateToTimestamp(new Date(request.expiration_date))
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
          schema_url: config.schemaUrl,
          ipfs_cid: ipfs_cid,
          revocation_nonce: issuedCred.credentialStatus.revocationNonce || 0,
          issued_at: new Date().toISOString(),
          expires_at: request.expiration_date || null,
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
        cred_id: cred_id, // DB ID (UUID), not the blockchain ID
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
    await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .update({
        status: 'offered',
        offered_at: new Date().toISOString(),
      })
      .eq('id', cred_id);
    const issuer_did = await this.sdk.initIdentity();
    const agentUrl = `${config.backendBaseUrl}/api/issue/fetch/${cred_id}`;
    const offer = createCredOffer(agentUrl, [
      {
        id: cred_id,
        type: [record.credential_type],
        schema: record.schema_url,
        description: `${record.credential_type} from ${issuer_did.split(':').pop()}`,
      },
    ], issuer_did) as CredentialOffer;
    const qrData = generateOfferQR(agentUrl);
    return {
      offer,
      qr_code_url: qrData.qrCodeUrl,
      qr_code_img: '',
    };
  }

  async fetchCredentialData(cred_id: string, threadId?: string) {
    const { data: record, error } = await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .select('*')
      .eq('id', cred_id)
      .single();
    if (error || !record) {
      throw new Error('Credential not found');
    }
    if (!record.ipfs_cid) {
      throw new Error('Credential not stored in IPFS');
    }
    await this.db
      .from(Tables.CREDENTIAL_RECORDS)
      .update({
        status: 'fetched',
        fetched_at: new Date().toISOString(),
      })
      .eq('id', cred_id);
    const cred_data = await this.ipfs.fetch(record.ipfs_cid, record.holder_did);
    const issuerDID = await this.sdk.initIdentity();
    // iden3comm fetch-response format
    const fetchResponse = createCredFetchResponse(
      cred_data,
      record.holder_did,
      threadId || cred_id,
      issuerDID
    );
    return fetchResponse;
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
      // Unpin to stop distributing revoked credential
      if (record.ipfs_cid) {
        try {
          await this.ipfs.unpin(record.ipfs_cid);
        } catch (error) {
          console.warn(`Failed to unpin ${record.ipfs_cid}:`, error);
        }
      }
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

  async getAllCredentialsByHolder(holder_did: string): Promise<CredentialRecord[]> {
    // await this.ipfs.fetch(cid, holder_did);
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

  async handleCredentialCallback(cred_id: string, response: any) {
    try {
      const { data: record, error } = await this.db
        .from(Tables.CREDENTIAL_RECORDS)
        .select('*')
        .eq('id', cred_id)
        .single();
      if (error || !record) {
        throw new Error('Credential not found');
      }
      const isAccepted = response.type?.includes('ack') ||
        response.body?.status === 'accepted' ||
        !response.body?.status;
      const updatedData: any = { status: isAccepted ? 'accepted' : 'rejected' };
      if (isAccepted) {
        updatedData.accepted_at = new Date().toISOString();
      } else {
        updatedData.rejection_reason = response.body?.description || 'User rejected credential';
      }
      const { error: updateError } = await this.db
        .from(Tables.CREDENTIAL_RECORDS)
        .update(updatedData)
        .eq('id', cred_id);
      if (updateError) {
        throw new Error(`Failed to update credential: ${updateError.message}`);
      }
      await this.db
        .from(Tables.AUDIT_LOGS)
        .insert({
          event_type: isAccepted ? 'CREDENTIAL_ACCEPTED' : 'CREDENTIAL_REJECTED',
          entity_type: 'CREDENTIAL',
          entity_id: cred_id,
          actor: record.holder_did,
          actor_type: 'HOLDER',
          details: {
            previous_status: record.status,
            new_status: updatedData.status,
            callback_type: response.type,
          },
        });
      return {
        success: true,
        status: updatedData.status,
        message: isAccepted
          ? 'Credential accepted'
          : 'Credential rejection',
      };
    } catch (error) {
      console.error('Credential callback failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Callback failed',
      };
    }
  }
}
