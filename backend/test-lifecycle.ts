import {
  BjjProvider,
  CredentialStorage,
  CredentialWallet,
  defaultEthConnectionConfig,
  EthStateStorage,
  IdentityStorage,
  IdentityWallet,
  KMS,
  KmsKeyType,
  InMemoryPrivateKeyStore,
  core,
  CredentialStatusType,
  W3CCredential,
  Identity,
  Profile,
  ProofService,
  CircuitId,
  CredentialStatusResolverRegistry,
  RHSResolver,
  jsonLDMerklizer
} from '@0xpolygonid/js-sdk';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IssuerService } from './src/services/IssuerService';
import { VerifierService } from './src/services/VerifierService';
import { getSupabaseClient, Tables } from './src/helpers/db';
import { initializeBlockchain } from './src/helpers/blockchain';
import { InMemoryMerkleTree, InMemoryStorage } from './src/helpers/inmemory';
import { CircuitsFs } from './src/helpers/circuitsfs';

const CONFIG = {
  studentId: 'STU001',
  employerId: 'EMP001',
  credentialType: 'DegreeCredential',
  expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  rpcUrl: 'https://rpc-amoy.polygon.technology/',
  stateContractAddr: '0x1a4cc30f2aa0377b0c3bc9848766d90cb4404124',
  chainId: 80002,
  circuitsPath: path.join(__dirname, 'circuits')
};

async function main() {
  console.log('Configuration:', {
    studentId: CONFIG.studentId,
    employerId: CONFIG.employerId,
    credentialType: CONFIG.credentialType,
    chainId: CONFIG.chainId,
    stateContractAddr: CONFIG.stateContractAddr
  });
  console.log('[Step 0] Initializing Blockchain Service');
  try {
    await initializeBlockchain();
  } catch (error) {
    console.error('[Step 0] Failed to initialize blockchain:', error);
    throw error;
  }
  console.log('[Step 1] Initializing holder wallet and key management system');
  const keyStore = new InMemoryPrivateKeyStore();
  const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, keyStore);
  const kms = new KMS();
  kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);
  console.log('[Step 1] Configuring data storage layers');
  const dataStorage = {
    credential: new CredentialStorage(new InMemoryStorage<W3CCredential>()),
    identity: new IdentityStorage(new InMemoryStorage<Identity>(), new InMemoryStorage<Profile>()),
    mt: new InMemoryMerkleTree(40),
    states: new EthStateStorage({
      ...defaultEthConnectionConfig,
      url: CONFIG.rpcUrl,
      contractAddress: CONFIG.stateContractAddr,
      chainId: CONFIG.chainId
    }),
  };
  console.log('[Step 1] Registering credential status resolvers');
  const resolvers = new CredentialStatusResolverRegistry();
  resolvers.register(
    CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    new RHSResolver(dataStorage.states)
  );
  const credWallet = new CredentialWallet(dataStorage, resolvers);
  const holderWallet = new IdentityWallet(kms, dataStorage, credWallet);
  const circuits = new CircuitsFs();
  console.log('[Step 1] Loading schemas');
  const defLoader = jsonLDMerklizer.getDocumentLoader();
  const docLoader = async (url: string) => {
    if (url === 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld') {
      console.log('[DocumentLoader] Loading local JSON-LD context for:', url);
      const ctxt = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas/DegreeCredential-v1.json-ld'), 'utf-8'));
      return {
        contextUrl: null,
        document: ctxt,
        documentUrl: url
      };
    }
    if (url === 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json') {
      console.log('[DocumentLoader] Loading local JSON schema for:', url);
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas/DegreeCredential-v1.json'), 'utf-8'));
      return {
        contextUrl: null,
        document: schema,
        documentUrl: url
      };
    }
    return defLoader(url);
  };
  console.log('[Step 1] Initializing proof service');
  const proofService = new ProofService(
    holderWallet,
    credWallet,
    circuits,
    dataStorage.states,
    {
      documentLoader: docLoader
    }
  );

  console.log('[Step 2] Creating Holder Identity');
  const STATE_FILE = path.join(__dirname, 'wallet.json');
  let seedPhrase: string;
  let savedCred: any = null;
  if (fs.existsSync(STATE_FILE)) {
    console.log('[Step 2] Found existing wallet state file');
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    seedPhrase = state.seedPhrase;
    savedCred = state.credential;
  } else {
    seedPhrase = crypto.randomBytes(32).toString('hex');
  }
  console.log('[Step 2] Creating identity with parameters:', {
    method: 'Iden3',
    blockchain: 'Polygon',
    networkId: 'Amoy',
    revocationType: 'Iden3ReverseSparseMerkleTreeProof'
  });
  const { did } = await holderWallet.createIdentity({
    method: core.DidMethod.Iden3,
    blockchain: core.Blockchain.Polygon,
    networkId: core.NetworkId.Amoy,
    seed: crypto.createHash('sha256').update(seedPhrase).digest(),
    revocationOpts: { type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof, id: 'https://rhs-staging.polygonid.me' }
  });
  const holderDid = did.string();
  console.log('[Step 2] Holder DID created:', holderDid);

  console.log('[Step 3] Linking DID to Student in Database');
  const db = getSupabaseClient();
  const { error: bindError } = await db.from(Tables.DID_BINDINGS).upsert({
    student_id: CONFIG.studentId,
    did: holderDid,
    status: 'active'
  }, { onConflict: 'student_id' });
  if (bindError) {
    console.error('[Step 3] Failed to bind DID to student:', bindError.message);
    throw new Error(`Failed to bind DID: ${bindError.message}`);
  }

  let credential;
  if (savedCred) {
    console.log('[Step 4] Using saved credential from previous session');
    credential = savedCred;
    console.log('[Step 4] Credential ID:', credential.id);
  } else {
    console.log('[Step 4] Issuing new credential');
    const issuerService = new IssuerService();
    const credSubject = {
      id: holderDid,
      university: 'Arizona State University',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      graduationYear: 2025,
      gpa: 3.8,
      honors: 'Blockchain'
    };
    console.log('[Step 4] Credential subject data:', credSubject);
    console.log('[Step 4] Expiration date:', CONFIG.expirationDate);
    const issuedRes = await issuerService.issueCred({
      student_id: CONFIG.studentId,
      credential_type: CONFIG.credentialType,
      expiration_date: CONFIG.expirationDate,
      credential_subject: credSubject
    });
    if (!issuedRes.success || !issuedRes.cred_id) {
      console.error('[Step 4] Credential issuance failed:', issuedRes.error);
      throw new Error(`Issuance failed: ${issuedRes.error}`);
    }
    console.log('[Step 4] Credential issued successfully');
    console.log('[Step 4] Credential ID:', issuedRes.cred_id);

    console.log('[Step 5] Fetching credential data from issuer');
    const issuedResp = await issuerService.fetchCredentialData(issuedRes.cred_id);
    credential = issuedResp.body.credential;
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      seedPhrase,
      credential
    }, null, 2));
  }
  console.log('[Step 5] Credential subject data:', JSON.stringify(credential.credentialSubject, null, 2));

  console.log('[Step 6] Holder saving credential to wallet');
  const w3cCredential = W3CCredential.fromJSON(credential);
  await credWallet.save(w3cCredential);
  console.log('[Step 6] Credential saved to wallet successfully');

  console.log('[Step 7] Starting verification process');
  const verifierService = new VerifierService();
  const verifyConf = {
    credentialType: CONFIG.credentialType,
    allowedIssuers: ['*'],
    schemaUrl: 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld',
    constraints: [
      { field: 'degree', operator: '$eq' as const, value: 'Bachelor of Science' }
    ]
  };
  console.log('[Step 7] Creating verification session');
  console.log('[Step 7] Verification config:', verifyConf);
  console.log('[Step 7] Employer ID:', CONFIG.employerId);
  const { session } = await verifierService.createVerifySession(verifyConf, CONFIG.employerId);
  console.log('[Step 7] Session ID:', session.id);
  console.log('[Step 7] Retrieving proof request from verifier');
  const proofReq = await verifierService.getProofRequest(session.id) as any;
  console.log('[Step 7] Holder generating zero-knowledge proof');
  const scope = proofReq.body.scope[0];
  const zkRequest = {
    id: 1,
    circuitId: scope.circuitId as CircuitId,
    query: scope.query,
    optional: false
  };
  console.log('[Step 7] ZK request parameters:', JSON.stringify(zkRequest, null, 2));
  const zkResponse = await proofService.generateProof(
    zkRequest,
    did
  );
  console.log('[Step 7] Zero-knowledge proof generated successfully');
  console.log('[Step 7] Proof details:', JSON.stringify(zkResponse, null, 2));
  console.log('[Step 7] Making proof response in iden3comm format');
  const proofResp = {
    id: proofReq.id,
    typ: 'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/proofs/1.0/response',
    thid: proofReq.thid,
    body: {
      scope: [{
        id: zkResponse.id,
        circuitId: zkResponse.circuitId,
        proof: {
          proof: zkResponse.proof,
          pub_signals: zkResponse.pub_signals
        }
      }]
    },
    from: holderDid
  };
  const verifiedResult = await verifierService.handleProofCallback(session.id, proofResp as any);
  if (verifiedResult.verified) {
    console.log('[Step 7] Verification status: SUCCESS');
    console.log('[Step 7] Disclosed attributes:', verifiedResult.disclosed_attributes);
  } else {
    console.error('[Step 7] Verification status: FAILED');
    console.error('[Step 7] Failure reason:', verifiedResult.failure_reason);
    if (verifiedResult.errors) {
      console.error('[Step 7] Errors:', verifiedResult.errors);
    }
  }
  process.exit(0);
}

main().catch(error => {
  console.error('Error occured:', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
