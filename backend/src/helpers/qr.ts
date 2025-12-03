export interface QRCodeData {
  qrCodeUrl: string;
  qrCodeImg?: string;
}

// Generates iden3comm QR code URL
// Wallet scans this and fetches the actual request from the request_uri
export function generateIden3commQR(
  requestUri: string,
  type: 'auth' | 'offer' | 'proof'
) {
  return `iden3comm://?request_uri=${encodeURIComponent(requestUri)}`;
}

export function generateAuthQR(backendBaseUrl: string, sessionId: string): QRCodeData {
  const requestUri = `${backendBaseUrl}/api/auth/request/${sessionId}`;
  const qrCodeUrl = generateIden3commQR(requestUri, 'auth');
  return { qrCodeUrl };
}

export function generateOfferQR(offerUrl: string): QRCodeData {
  const qrCodeUrl = generateIden3commQR(offerUrl, 'offer');
  return { qrCodeUrl };
}

export function generateProofRequestQR(backendBaseUrl: string, verifyId: string): QRCodeData {
  const requestUri = `${backendBaseUrl}/api/verify/request/${verifyId}`;
  const qrCodeUrl = generateIden3commQR(requestUri, 'proof');
  return { qrCodeUrl };
}

export function createAuthRequest(
  callbackUrl: string,
  nonce: string,
  issuerDID: string,
  reason?: string
) {
  return {
    id: generateRequestId(),
    typ: 'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/authorization/1.0/request',
    thid: generateRequestId(),
    body: {
      callbackUrl,
      reason: reason || 'Authentication required',
      message: nonce,
      scope: [],
    },
    from: issuerDID,
  };
}

export function createCredOffer(
  offerUrl: string,
  credentials: Array<{ id: string; type: string[]; schema: string; description?: string }>,
  issuerDID: string
) {
  const reqId = generateRequestId();
  return {
    id: reqId,
    typ: 'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/credentials/1.0/offer',
    thid: reqId,
    body: {
      url: offerUrl,
      credentials: credentials.map(cred => ({
        ...cred,
        description: cred.description || `${cred.type[cred.type.length - 1]} credential`,
      })),
    },
    from: issuerDID,
  };
}

export function createCredFetchResponse(
  credential: any,
  holderDID: string,
  threadId: string,
  issuerDID: string
) {
  return {
    id: generateRequestId(),
    typ: 'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/credentials/1.0/fetch-response',
    thid: threadId,
    body: {
      credential,
    },
    from: issuerDID,
    to: holderDID,
  };
}

export function createProofRequest(
  callbackUrl: string,
  reason: string,
  allowedIssuers: string[],
  credentialType: string,
  issuerDID: string,
  constraints?: Record<string, any>,
  contextUrl?: string
) {
  const query: any = {
    allowedIssuers,
    context: contextUrl || 'https://www.w3.org/2018/credentials/v1',
    type: credentialType,
  };
  if (constraints) {
    query.credentialSubject = constraints;
  }
  return {
    id: generateRequestId(),
    typ: 'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/proofs/1.0/request',
    thid: generateRequestId(),
    body: {
      callbackUrl,
      reason,
      scope: [
        {
          id: 1,
          circuitId: 'credentialAtomicQuerySigV2',
          query,
        },
      ],
    },
    from: issuerDID,
  };
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function validateIden3commResp(response: any) {
  if (!response || typeof response !== 'object') {
    console.error('[Validation] Response is not an object');
    return false;
  }
  const requiredFields = ['id', 'typ', 'type', 'body'];
  for (const field of requiredFields) {
    if (!(field in response)) {
      console.error(`[Validation] Missing required field: ${field}`);
      console.error('[Validation] Available fields:', Object.keys(response));
      return false;
    }
  }
  const validTypes = [
    'application/iden3comm-plain-json',
    'application/iden3-zkp-json',
  ];
  if (!validTypes.includes(response.typ)) {
    console.error(`[Validation] Invalid typ: ${response.typ}, expected one of:`, validTypes);
    return false;
  }
  return true;
}

export function extractDIDFromResp(resp: any) {
  if (!resp || !resp.from) {
    return null;
  }
  return resp.from;
}

// Decode JWT/JWS token from Privado ID
// Privado sends responses as JWS tokens in format: header.payload.signature
export function decodePrivadoJWT(token: string) {
  try {
    // Split the JWS token
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[JWT] Invalid token format - expected 3 parts, got', parts.length);
      return null;
    }
    // Decode the payload (middle part)
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded);
    console.log('[JWT] Decoded payload:', JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (error) {
    console.error('[JWT] Failed to decode token:', error);
    return null;
  }
}
