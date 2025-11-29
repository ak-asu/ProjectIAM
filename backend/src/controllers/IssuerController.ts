import { Request, Response } from 'express';
import { IssuerService } from '../services/IssuerService';

export class IssuerController {
  private issuerService: IssuerService;

  constructor() {
    this.issuerService = new IssuerService();
  }

  prepareCred = async (req: Request, res: Response) => {
    try {
      const request = req.body;
      const result = await this.issuerService.prepareCred(request);
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to prepare credential',
      });
    }
  };

  issueCred = async (req: Request, res: Response) => {
    try {
      const request = req.body;
      const result = await this.issuerService.issueCred(request);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to issue credential',
      });
    }
  };

  getOffer = async (req: Request, res: Response) => {
    try {
      const { credId } = req.params;
      let holderDID = req.query.holderDID as string | undefined;
      if (!holderDID) {
        const credential = await this.issuerService.getCredential(credId);
        if (!credential) {
          res.status(404).json({ error: 'Credential not found' });
          return;
        }
        holderDID = credential.holder_did;
      }
      const result = await this.issuerService.getCredOffer(credId, holderDID);
      res.json(result.offer);
    } catch (error: any) {
      res.status(404).json({
        error: error.message || 'Credential not found',
      });
    }
  };

  revokeCred = async (req: Request, res: Response) => {
    try {
      const { credId, reason } = req.body;
      const user = (req as any).user;      
      if (!credId || !reason) {
        res.status(400).json({
          success: false,
          error: 'Credential ID and reason required',
        });
        return;
      }      
      const revokedBy = user?.email || 'admin';
      const result = await this.issuerService.revokeCredential(credId, reason, revokedBy);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Revocation failed',
      });
    }
  };

  getCredential = async (req: Request, res: Response) => {
    try {
      const { credId } = req.params;
      const credential = await this.issuerService.getCredential(credId);
      if (!credential) {
        res.status(404).json({ error: 'Credential not found' });
        return;
      }
      res.json(credential);
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to get credential',
      });
    }
  };

  getAllCredentials = async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 32;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await this.issuerService.getAllCredentials(limit, offset);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to get credentials',
      });
    }
  };

  getHolderCreds = async (req: Request, res: Response) => {
    try {
      const { holderDID } = req.params;
      const credentials = await this.issuerService.getAllCredentialsByHolder(holderDID);
      res.json({ credentials });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to get credentials',
      });
    }
  };

  validateSchema = async (req: Request, res: Response) => {
    try {
      const { credentialType, credentialSubject } = req.body;
      if (!credentialType || !credentialSubject) {
        res.status(400).json({
          valid: false,
          errors: ['Missing credentialType or credentialSubject'],
        });
        return;
      }
      const result = await this.issuerService.validateCredSchema(
        credentialType,
        credentialSubject
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        valid: false,
        errors: [error.message || 'Validation failed'],
      });
    }
  };
}
