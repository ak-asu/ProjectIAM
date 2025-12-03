import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000'),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  rpcUrl: process.env.RPC_URL || '',
  contractAddr: process.env.CONTRACT_ADDRESS || '',
  issuerPrivateKey: process.env.ISSUER_PRIVATE_KEY || '',
  chainId: parseInt(process.env.CHAIN_ID || '80002'),
  issuerSeed: process.env.ISSUER_SEED || 'pseudounicredifyrandomphrase',
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:3001',
  sessionTTLMin: parseInt(process.env.SESSION_TTL_MIN || '15'),
  verifySessionTTLMin: parseInt(process.env.VERIFY_SESSION_TTL_MIN || '10'),
  ipfsApiUrl: process.env.IPFS_API_URL || '',
  ipfsGateway: process.env.IPFS_GATEWAY || '',
  pinataJwt: process.env.PINATA_JWT || '',
  schemaUrl: process.env.SCHEMA_URL || '',
  encryptionSecret: process.env.ENCRYPTION_SECRET || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['*'],
  enableZkProof: process.env.ENABLE_ZK_PROOF !== 'false',
  stateContractAddress: process.env.STATE_CONTRACT_ADDRESS || '0x1a4cc30f2aa0377b0c3bc9848766d90cb4404124',
};
