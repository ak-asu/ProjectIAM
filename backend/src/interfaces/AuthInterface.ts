// DID-based authentication with optional username/password binding
// Flow: User scans QR → Wallet authenticates → Backend verifies proof → Bind university credentials (first-time only)

import {
  Session,
  AuthorizationRequest,
  AuthorizationResponse,
  AuthQRData,
  StudentLinkingRequest,
  StudentLinkingResult,
} from '../types';

export interface AuthInterface {
  startAuthSession(): Promise<{
    session: Session;
    qr_data: AuthQRData;
  }>;
  // Called by wallet when QR code is scanned
  getAuthRequest(session_id: string): Promise<AuthorizationRequest>;
  // Verifies wallet auth response (proof signature, nonce, expiration)
  handleAuthCallback(session_id: string, response: AuthorizationResponse): Promise<{
    success: boolean;
    did_verified: boolean;
    student_linked: boolean;
    requires_binding: boolean;
    error?: string;
  }>;
  // Bind DID to student account (first-time only, prevents duplicates)
  bindStudentToDID(binding_request: StudentLinkingRequest): Promise<StudentLinkingResult>;
  getSessionStatus(session_id: string): Promise<{
    did_verified: boolean;
    student_linked: boolean;
    did?: string;
    student_id?: string;
    expires_at: string;
  }>;
  cleanupExpiredSessions(): Promise<number>; // Run via cron
  portalLogin(email: string, password: string): Promise<{
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
  }>;
  validatePortalToken(token: string): Promise<{
    userId: string;
    email: string;
    name: string;
    role: string;
  } | null>;
}
