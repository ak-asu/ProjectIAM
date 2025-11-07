/**
 * Handles DID-based authentication with optional username/password binding
 * 1. User scans QR code (iden3comm authorization request)
 * 2. Privado Wallet performs DID authentication
 * 3. Wallet sends authorization response to callback
 * 4. Backend verifies the proof using Verifier SDK
 * 5. For first-time users, prompt for university credentials to bind the DID
 * 6. Session is created for authenticated user
 */

export interface AuthSession {
  sessionId: string;
  did: string | null;
  didVerified: boolean;
  studentId: string | null;
  studentBound: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  nonce: string;
}

// Authorization request in iden3comm format
export interface AuthorizationRequest {
  type: 'https://iden3-communication.io/authorization/1.0/request';
  body: {
    callbackUrl: string;
    reason?: string;
    message: string;
    scope: Array<any>;
  };
}

// Authorization response from the wallet
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

export interface AuthQRData {
  sessionId: string;
  requestUri: string;
  qrCodeUrl: string;
  qrCodeImage?: string;
}

export interface StudentBindingRequest {
  sessionId: string;
  username: string;
  password: string;
  did: string;
}

export interface StudentBindingResult {
  success: boolean;
  studentId?: string;
  studentName?: string;
  error?: string;
}

export interface IAuthService {
  // Creates a new session and generates QR code for wallet authentication.
  startAuthSession(): Promise<{
    session: AuthSession;
    qrData: AuthQRData;
  }>;
  // Get the authorization request for a session and called by Privado Wallet when user scans QR code.
  getAuthRequest(sessionId: string): Promise<AuthorizationRequest>;
  /**
   * Handle the callback from Privado Wallet after authentication
   * Verifies the proof and updates the session.
   *
   * Verification checks:
   * - Proof signatures are valid
   * - Nonce matches session nonce
   * - Proof hasn't expired
   */
  handleAuthCallback(sessionId: string, response: AuthorizationResponse): Promise<{
    success: boolean;
    didVerified: boolean;
    studentBound: boolean;
    requiresBinding: boolean;
    error?: string;
  }>;
  /**
   * Bind a DID to a student account (first-time users only)
   * Verifies student credentials with university system and creates
   * permanent link between DID and student ID.
   *
   * Security measures:
   * - Only allows binding if DID matches verified session
   * - Prevents duplicate bindings
   * - Validates credentials with university system
   * - Logs all binding attempts for auditing
   */
  bindStudentToDID(bindingRequest: StudentBindingRequest): Promise<StudentBindingResult>;
  getSessionStatus(sessionId: string): Promise<{
    didVerified: boolean;
    studentBound: boolean;
    studentId?: string;
    expiresAt: Date;
  }>;
  getDIDForStudent(studentId: string): Promise<string | null>;
  getStudentForDID(did: string): Promise<string | null>;
  invalidateSession(sessionId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<number>;
}
