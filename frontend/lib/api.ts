const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiError {
  error: string;
}

export interface IssuanceResult {
  success: boolean;
  credId?: string;
  txHash?: string;
  merkleRoot?: string;
  ipfsCID?: string;
  error?: string;
  offerQRData?: {
    qrCodeUrl: string;
    qrCodeImg?: string;
    offerUrl: string;
  };
}

export interface AuthStartResult {
  sessionId: string;
  qrCodeUrl: string;
}

export interface AuthStatus {
  didVerified: boolean;
  studentLinked: boolean;
  did?: string;
  studentId?: string;
  expiresAt: Date;
}

export interface LinkStudentResult {
  success: boolean;
  error?: string;
}

export class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T = Record<string, unknown>>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({} as ApiError));
      throw new Error((error as ApiError).error || `${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async startAuth(): Promise<AuthStartResult> {
    return this.request<AuthStartResult>('/api/auth/start', { method: 'POST' });
  }

  async getAuthStatus(sessionId: string): Promise<AuthStatus> {
    return this.request<AuthStatus>(`/api/auth/status/${sessionId}`);
  }

  async linkStudent(data: {
    sessionId: string;
    username: string;
    password: string;
    did: string;
  }): Promise<LinkStudentResult> {
    return this.request<LinkStudentResult>('/api/auth/bind', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async prepareCredential(data: Record<string, unknown>) {
    return this.request('/api/issue/prepare', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async issueCredential(data: Record<string, unknown>): Promise<IssuanceResult> {
    return this.request<IssuanceResult>('/api/issue/credential', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCredential(credId: string) {
    return this.request(`/api/issue/credential/${credId}`);
  }

  async getAllCredentials(limit = 50, offset = 0) {
    return this.request(`/api/issue/credentials?limit=${limit}&offset=${offset}`);
  }

  async getHolderCredentials(holderDID: string) {
    return this.request(`/api/issue/holder/${holderDID}`);
  }

  async revokeCredential(credId: string, reason: string) {
    return this.request('/api/issue/revoke', {
      method: 'POST',
      body: JSON.stringify({ credId, reason }),
    });
  }

  async validateSchema(credentialType: string, credentialSubject: Record<string, unknown>) {
    return this.request('/api/issue/validate-schema', {
      method: 'POST',
      body: JSON.stringify({ credentialType, credentialSubject }),
    });
  }

  async createVerificationSession(policy: Record<string, unknown>, verifierId?: string) {
    return this.request('/api/verify/session', {
      method: 'POST',
      body: JSON.stringify({ policy, verifierId }),
    });
  }

  async getVerificationStatus(verifyId: string) {
    return this.request(`/api/verify/status/${verifyId}`);
  }

  async getVerificationSessions(verifierId: string, limit = 50, offset = 0) {
    return this.request(
      `/api/verify/sessions?verifierId=${verifierId}&limit=${limit}&offset=${offset}`
    );
  }

  async checkCredentialValidity(credId: string) {
    return this.request(`/api/verify/check/${credId}`);
  }
}

export const api = new APIClient();
