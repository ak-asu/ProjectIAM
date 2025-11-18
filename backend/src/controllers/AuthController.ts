import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { decodePrivadoJWT } from '../helpers/qr';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  startAuthSession = async (_req: Request, res: Response) => {
    try {
      const result = await this.authService.startAuthSession();
      res.json({
        success: true,
        sessionId: result.session.id,
        qrCodeUrl: result.qr_data.qr_code_url,
        requestUri: result.qr_data.request_uri,
        expiresAt: result.session.expires_at,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start authentication session',
      });
    }
  };

  getAuthRequest = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      console.log(`Wallet requesting auth for session: ${sessionId}`);
      const authRequest = await this.authService.getAuthRequest(sessionId);
      console.log('Sending auth request:', JSON.stringify(authRequest, null, 2));
      res.json(authRequest);
    } catch (error: any) {
      console.error('Error getting auth request:', error.message);
      res.status(404).json({
        error: error.message || 'Session not found',
      });
    }
  };

  handleAuthCallback = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'Session ID required' });
        return;
      }
      console.log(`Processing callback for session: ${sessionId}`);
      console.log(`Content-Type: ${req.get('Content-Type')}`);
      let response = req.body;
      console.log(`req.body type: ${typeof response}`);
      // Privado ID wallet sends auth response as JWS token (text/plain)
      // Decode it to extract the JSON payload
      if (typeof response === 'string') {
        console.log('Detected JWS token, decoding...');
        response = decodePrivadoJWT(response);
        if (!response) {
          res.status(400).json({
            success: false,
            error: 'Failed to decode authentication response',
          });
          return;
        }
      }
      console.log('Received callback payload:', JSON.stringify(response, null, 2));
      const result = await this.authService.handleAuthCallback(sessionId, response);
      console.log('Callback result:', JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error: any) {
      console.error('Callback error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Authentication callback failed',
      });
    }
  };

  linkStudent = async (req: Request, res: Response) => {
    try {
      const { sessionId, username, password, did } = req.body;
      if (!sessionId || !username || !password || !did) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
        });
        return;
      }
      const result = await this.authService.bindStudentToDID({
        session_id: sessionId,
        username,
        password,
        did,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Binding failed',
      });
    }
  };

  getStatus = async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const status = await this.authService.getSessionStatus(sessionId);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(status);
    } catch (error: any) {
      res.status(404).json({
        error: error.message || 'Session not found',
      });
    }
  };
}
