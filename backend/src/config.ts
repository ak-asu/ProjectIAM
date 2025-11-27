import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  rpcUrl: process.env.RPC_URL || '',
  contractAddr: process.env.CONTRACT_ADDRESS || '',
  issuerPrivateKey: process.env.ISSUER_PRIVATE_KEY || '',
  chainId: parseInt(process.env.CHAIN_ID || '80002'),
  issuerDID: process.env.ISSUER_DID || '',
  issuerNodeBaseUrl: process.env.ISSUER_NODE_BASE_URL || '',
  issuerNodeApiKey: process.env.ISSUER_NODE_API_KEY || '',
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:3001',
  sessionTTLMin: parseInt(process.env.SESSION_TTL_MIN || '15'),
  verifySessionTTLMin: parseInt(process.env.VERIFY_SESSION_TTL_MIN || '10'),
  ipfsApiUrl: process.env.IPFS_API_URL || '',
  ipfsGateway: process.env.IPFS_GATEWAY || '',
  pinataJwt: process.env.PINATA_JWT || '',
  schemaUrl: process.env.SCHEMA_URL || '',
  encryptionSecret: process.env.ENCRYPTION_SECRET || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  verificationKeyPath: process.env.VERIFICATION_KEY_PATH || '',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['*']
};
