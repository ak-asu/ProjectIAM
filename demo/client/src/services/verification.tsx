import axios from 'axios';

const OnchainIssuerNodeHost = process.env.NEXT_PUBLIC_ISSUER_URL || 'http://localhost:8080';

interface ApiError extends Error {
    response?: {
        status: number;
    };
}

/**
 * Verification request payload
 * Simplified for degree credential verification
 */
export interface VerificationRequest {
    credentialType: string;
    schemaUrl: string;
    query: {
        [key: string]: any;
    };
    disclose: string[];
}

/**
 * Verification QR code response
 */
interface VerificationQRCodeResponse {
    data: any;
    sessionId: string;
}

/**
 * Verification status response
 */
interface VerificationStatusResponse {
    status: string;
    did: string;
}

/**
 * Creates a verification request and returns QR code data
 *
 * @param verificationRequest - The verification request parameters
 * @returns QR code data and session ID
 */
export async function createVerificationRequest(
    verificationRequest: VerificationRequest
): Promise<VerificationQRCodeResponse> {
    try {
        const response = await axios.post<any>(
            `${OnchainIssuerNodeHost}/api/v1/verification/request`,
            verificationRequest
        );
        return {
            data: response.data,
            sessionId: response.headers['x-id'],
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Checks the status of a verification session
 *
 * @param sessionId - The verification session ID
 * @returns Verification status (verified DID) or null if pending
 */
export async function checkVerificationStatus(
    sessionId: string
): Promise<VerificationStatusResponse | null> {
    try {
        const url = new URL(`${OnchainIssuerNodeHost}/api/v1/verification/status`);
        url.search = new URLSearchParams({ id: sessionId }).toString();
        const response = await axios.get<any>(url.toString());
        return {
            status: response.data.status,
            did: response.data.did,
        };
    } catch (error) {
        const apiError = error as ApiError;
        if (apiError.response && apiError.response.status === 404) {
            // Verification not completed yet
            return null;
        }
        throw error;
    }
}
