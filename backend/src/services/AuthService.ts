import { IAuthService } from '../interfaces/IAuthService';
import {
  getSupabaseClient,
  Tables,
  Session,
  AuthorizationRequest,
  AuthorizationResponse,
  AuthQRData,
  StudentLinkingRequest,
} from '../helpers/db';
import { generateNonce, generateSessionId, getFutureTimestamp, timestampToDate } from '../helpers/crypto';
import { generateAuthQR, createAuthRequest, validateIden3commResp, extractDIDFromResp } from '../helpers/qr';
import * as bcrypt from 'bcrypt';
import { config } from '../config';

export class AuthService implements IAuthService {
  private db = getSupabaseClient();

  async startAuthSession() {
    const session_id = generateSessionId();
    const nonce = generateNonce();
    const expires_at = timestampToDate(getFutureTimestamp(config.sessionTTLMin));
    const { data: dbSession, error } = await this.db
      .from(Tables.SESSIONS)
      .insert({
        id: session_id,
        nonce,
        did_verified: false,
        expires_at: expires_at.toISOString(),
      })
      .select()
      .single();
    if (error || !dbSession) {
      throw new Error(`Failed to create session: ${error?.message || 'Unknown error'}`);
    }
    const session: Session = dbSession;
    const qrCodeData = generateAuthQR(config.backendBaseUrl, session_id);
    const qr_data: AuthQRData = {
      session_id,
      request_uri: `${config.backendBaseUrl}/api/auth/request/${session_id}`,
      qr_code_url: qrCodeData.qrCodeUrl,
      ...(qrCodeData.qrCodeImg && { qr_code_img: qrCodeData.qrCodeImg }),
    };
    return { session, qr_data };
  }

  async getAuthRequest(session_id: string) {
    const { data: session, error } = await this.db
      .from(Tables.SESSIONS)
      .select('*')
      .eq('id', session_id)
      .single();
    if (error || !session) {
      throw new Error('Session not found');
    }
    if (new Date() > new Date(session.expires_at)) {
      throw new Error('Session expired');
    }
    const callbackUrl = `${config.backendBaseUrl}/api/auth/callback?sessionId=${session_id}`;
    return createAuthRequest(callbackUrl, session.nonce, 'Authenticate with your DID') as AuthorizationRequest;
  }

  async handleAuthCallback(session_id: string, response: AuthorizationResponse) {
    try {
      const { data: session, error: sessionError } = await this.db
        .from(Tables.SESSIONS)
        .select('*')
        .eq('id', session_id)
        .single();
      if (sessionError || !session) {
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'Session not found',
        };
      }
      if (new Date() > new Date(session.expires_at)) {
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'Session expired',
        };
      }
      console.log('Response:', response);
      if (!response || typeof response !== 'object') {
        console.error('Response is null/undefined or not an object');
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'No response data received from wallet',
        };
      }
      if (!validateIden3commResp(response)) {
        console.error('Response validation failed:', JSON.stringify(response, null, 2));
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'Invalid response format',
        };
      }
      const holderDID = extractDIDFromResp(response);
      if (!holderDID) {
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'Invalid DID in response',
        };
      }
      // For basic auth (no credential verification), verify the message/nonce
      // TODO: Need to add ZK proof verification for credential-based authentication
      const expectedMessage = session.nonce;
      const receivedMessage = response.body?.message;
      if (receivedMessage !== expectedMessage) {
        console.error(`Message mismatch - expected: ${expectedMessage}, received: ${receivedMessage}`);
        return {
          success: false,
          did_verified: false,
          student_linked: false,
          requires_binding: false,
          error: 'Message verification failed',
        };
      }
      const { error: updateError } = await this.db
        .from(Tables.SESSIONS)
        .update({
          did: holderDID,
          did_verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', session_id);
      if (updateError) {
        throw new Error(`Failed to update session: ${updateError.message}`);
      }
      // Check if DID is already bound to a student account
      const { data: binding, error: bindingError } = await this.db
        .from(Tables.DID_BINDINGS)
        .select('*')
        .eq('did', holderDID)
        .single();
      let student_linked = false;
      if (!bindingError && binding) {
        await this.db
          .from(Tables.SESSIONS)
          .update({ student_id: binding.student_id })
          .eq('id', session_id);
        student_linked = true;
      }
      return {
        success: true,
        did_verified: true,
        student_linked,
        requires_binding: !student_linked,
      };
    } catch (error) {
      console.error('Auth callback error:', error);
      return {
        success: false,
        did_verified: false,
        student_linked: false,
        requires_binding: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  async bindStudentToDID(binding_request: StudentLinkingRequest) {
    try {
      const { session_id, username, password, did } = binding_request;
      const { data: session, error: sessionError } = await this.db
        .from(Tables.SESSIONS)
        .select('*')
        .eq('id', session_id)
        .single();
      if (sessionError || !session) {
        return { success: false, error: 'Session not found' };
      }
      if (!session.did_verified || session.did !== did) {
        return { success: false, error: 'DID not verified or mismatch' };
      }
      const { data: existingBinding } = await this.db
        .from(Tables.DID_BINDINGS)
        .select('*')
        .eq('did', did)
        .single();
      if (existingBinding) {
        return { success: false, error: 'DID already bound to another account' };
      }
      const { data: user, error: userError } = await this.db
        .from(Tables.USERS)
        .select('*')
        .eq('email', username)
        .single();
      if (userError || !user) {
        return { success: false, error: 'Invalid credentials' };
      }
      if (user.password_hash) {
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
          return { success: false, error: 'Invalid credentials' };
        }
      }
      const { error: bindingError } = await this.db
        .from(Tables.DID_BINDINGS)
        .insert({
          student_id: user.student_id,
          did,
          status: 'active',
        });
      if (bindingError) {
        throw new Error(`Failed to create binding: ${bindingError.message}`);
      }
      await this.db
        .from(Tables.SESSIONS)
        .update({ student_id: user.student_id })
        .eq('id', session_id);
      await this.db
        .from(Tables.AUDIT_LOGS)
        .insert({
          event_type: 'DID_BINDING',
          entity_type: 'USER',
          entity_id: user.student_id,
          actor: did,
          actor_type: 'DID',
          details: {
            session_id,
            did,
            student_id: user.student_id,
          },
        });
      return {
        success: true,
        student_id: user.student_id,
        student_name: user.name,
      };
    } catch (error) {
      console.error('Binding error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Binding failed' };
    }
  }

  async getSessionStatus(session_id: string) {
    const { data: session, error } = await this.db
      .from(Tables.SESSIONS)
      .select('*')
      .eq('id', session_id)
      .single();
    if (error || !session) {
      throw new Error('Session not found');
    }
    return {
      did_verified: session.did_verified,
      student_linked: !!session.student_id,
      did: session.did || undefined,
      student_id: session.student_id || undefined,
      expires_at: session.expires_at,
    };
  }

  async getDIDForStudent(student_id: string) {
    const { data: binding } = await this.db
      .from(Tables.DID_BINDINGS)
      .select('did')
      .eq('student_id', student_id)
      .single();
    return binding?.did || null;
  }

  async getStudentForDID(did: string) {
    const { data: binding } = await this.db
      .from(Tables.DID_BINDINGS)
      .select('student_id')
      .eq('did', did)
      .single();
    return binding?.student_id || null;
  }

  async invalidateSession(session_id: string) {
    await this.db
      .from(Tables.SESSIONS)
      .delete()
      .eq('id', session_id);
  }

  async cleanupExpiredSessions() {
    const { data, error } = await this.db
      .from(Tables.SESSIONS)
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();
    if (error) {
      console.error('Failed cleanup of expired sessions:', error);
      return 0;
    }
    return data?.length || 0;
  }
}
