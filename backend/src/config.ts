import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  rpcUrl: process.env.RPC_URL || '',
  contractAddr: process.env.CONTRACT_ADDRESS || '',
  issuerPrivateKey: process.env.ISSUER_PRIVATE_KEY || '',
  chainId: parseInt(process.env.CHAIN_ID || '80002'), // Polygon Amoy testnet default
  issuerDID: process.env.ISSUER_DID || '',
  issuerNodeBaseUrl: process.env.ISSUER_NODE_BASE_URL || '',
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:3001',
  sessionTTLMin: parseInt(process.env.SESSION_TTL_MIN || '15'),
  verifySessionTTLMin: parseInt(process.env.VERIFY_SESSION_TTL_MIN || '10'),
  ipfsApiUrl: process.env.IPFS_API_URL || '',
  ipfsGateway: process.env.IPFS_GATEWAY || '',
  pinataApiKey: process.env.PINATA_API_KEY || '',
  pinataSecretKey: process.env.PINATA_SECRET_KEY || '',
  schemaUrl: process.env.SCHEMA_URL || 'ipfs://QmDegreeCredentialSchema',
  encryptionSecret: process.env.ENCRYPTION_SECRET || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['*']
};
