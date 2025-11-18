import { Request, Response } from 'express';
import { VerifierService } from '../services/VerifierService';

export class VerifierController {
  private verifierService: VerifierService;

  constructor() {
    this.verifierService = new VerifierService();
  }

  createSession = async (req: Request, res: Response) => {
    try {
      const { policy, verifierId } = req.body;
      if (!policy || !policy.allowedIssuers || !policy.credentialType) {
        res.status(400).json({
          success: false,
          error: 'Invalid policy: allowedIssuers and credentialType required',
        });
        return;
      }
      const result = await this.verifierService.createVerifySession(policy, verifierId);
      res.json({
        success: true,
        verifyId: result.session.id,
        qrCodeUrl: result.qr_data.qr_code_url,
        requestUri: result.qr_data.request_uri,
        expiresAt: result.session.expires_at,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create verification session',
      });
    }
  };

  getProofReq = async (req: Request, res: Response) => {
    try {
      const { verifyId } = req.params;
      const proofRequest = await this.verifierService.getProofRequest(verifyId);
      res.json(proofRequest);
    } catch (error: any) {
      res.status(404).json({
        error: error.message || 'Verification session not found',
      });
    }
  };

  handleProofCallback = async (req: Request, res: Response) => {
    try {
      const { verifyId } = req.query;
      if (!verifyId || typeof verifyId !== 'string') {
        res.status(400).json({ error: 'Verify ID required' });
        return;
      }
      const proofResponse = req.body;
      const result = await this.verifierService.handleProofCallback(verifyId, proofResponse);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        verified: false,
        error: error.message || 'Verification failed',
      });
    }
  };

  getStatus = async (req: Request, res: Response) => {
    try {
      const { verifyId } = req.params;
      const status = await this.verifierService.getVerifyStatus(verifyId);
      res.json(status);
    } catch (error: any) {
      res.status(404).json({
        error: error.message || 'Verification session not found',
      });
    }
  };

  getSessions = async (req: Request, res: Response) => {
    try {
      const { verifierId } = req.query;
      const limit = parseInt(req.query.limit as string) || 32;
      const offset = parseInt(req.query.offset as string) || 0;
      if (!verifierId || typeof verifierId !== 'string') {
        res.status(400).json({ error: 'Verifier ID required' });
        return;
      }
      const result = await this.verifierService.getVerificationsByVerifier(
        verifierId,
        limit,
        offset
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to get verification sessions',
      });
    }
  };

  checkValidity = async (req: Request, res: Response) => {
    try {
      const { credId } = req.params;
      const result = await this.verifierService.checkCredValidity(credId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        isValid: false,
        reason: error.message || 'Check failed',
      });
    }
  };
}
