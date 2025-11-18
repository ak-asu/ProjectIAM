import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { IssuerController } from './controllers/IssuerController';
import { VerifierController } from './controllers/VerifierController';

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/start', authController.startAuthSession);
authRoutes.get('/request/:sessionId', authController.getAuthRequest);
authRoutes.post('/callback', authController.handleAuthCallback);
authRoutes.post('/bind', authController.linkStudent);
authRoutes.get('/status/:sessionId', authController.getStatus);

const issuerRoutes = Router();
const issuerController = new IssuerController();

issuerRoutes.post('/prepare', issuerController.prepareCred);
issuerRoutes.post('/credential', issuerController.issueCred);
issuerRoutes.get('/offer/:credId', issuerController.getOffer);
issuerRoutes.post('/revoke', issuerController.revokeCred);
issuerRoutes.get('/credential/:credId', issuerController.getCredential);
issuerRoutes.get('/credentials', issuerController.getAllCredentials);
issuerRoutes.get('/holder/:holderDID', issuerController.getHolderCreds);
issuerRoutes.post('/validate-schema', issuerController.validateSchema);

const verifierRoutes = Router();
const verifierController = new VerifierController();

verifierRoutes.post('/session', verifierController.createSession);
verifierRoutes.get('/request/:verifyId', verifierController.getProofReq);
verifierRoutes.post('/callback', verifierController.handleProofCallback);
verifierRoutes.get('/status/:verifyId', verifierController.getStatus);
verifierRoutes.get('/sessions', verifierController.getSessions);
verifierRoutes.get('/check/:credId', verifierController.checkValidity);

export { authRoutes, issuerRoutes, verifierRoutes };
