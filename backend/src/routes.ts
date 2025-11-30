import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { IssuerController } from './controllers/IssuerController';
import { VerifierController } from './controllers/VerifierController';

const authRoutes = Router();
const authController = new AuthController();

// Student authentication (DID-based)
authRoutes.post('/start', authController.startAuthSession);
authRoutes.get('/request/:sessionId', authController.getAuthRequest);
authRoutes.post('/callback', authController.handleAuthCallback);
authRoutes.post('/bind', authController.linkStudent);
authRoutes.get('/status/:sessionId', authController.getStatus);
// Portal authentication (employer email/password login)
authRoutes.post('/portal/login', authController.portalLogin);
authRoutes.post('/portal/logout', authController.portalLogout);
authRoutes.get('/portal/verify', authController.verifyPortalToken);

const issuerRoutes = Router();
const issuerController = new IssuerController();

// Issuer routes (require admin API key authentication)
issuerRoutes.post('/prepare', authController.requireAdminAuth, issuerController.prepareCred);
issuerRoutes.post('/credential', authController.requireAdminAuth, issuerController.issueCred);
issuerRoutes.get('/offer/:credId', issuerController.getOffer); // Public - wallet needs to fetch
issuerRoutes.get('/fetch/:credId', issuerController.fetchCredential); // Public - wallet fetches actual credential
issuerRoutes.post('/revoke', authController.requireAdminAuth, issuerController.revokeCred);
issuerRoutes.get('/credential/:credId', issuerController.getCredential); // Public - for viewing
issuerRoutes.get('/credentials', authController.requireAdminAuth, issuerController.getAllCredentials);
issuerRoutes.get('/holder/:holderDID', issuerController.getHolderCreds); // Public - student can view own
issuerRoutes.post('/validate-schema', authController.requireAdminAuth, issuerController.validateSchema);

const verifierRoutes = Router();
const verifierController = new VerifierController();

// Verifier routes (require employer authentication)
verifierRoutes.post('/session', authController.requireEmployerAuth, verifierController.createSession);
verifierRoutes.get('/request/:verifyId', verifierController.getProofReq);
verifierRoutes.post('/callback', verifierController.handleProofCallback);
verifierRoutes.get('/status/:verifyId', verifierController.getStatus);
verifierRoutes.get('/sessions', authController.requireEmployerAuth, verifierController.getSessions);
verifierRoutes.get('/check/:credId', verifierController.checkValidity);

export { authRoutes, issuerRoutes, verifierRoutes };
