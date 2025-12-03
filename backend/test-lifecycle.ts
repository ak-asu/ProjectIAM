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
import * as readline from 'readline';
import { IssuerService } from './src/services/IssuerService';
import { VerifierService } from './src/services/VerifierService';
import { getSupabaseClient, Tables } from './src/helpers/db';
import { initializeBlockchain } from './src/helpers/blockchain';
import { InMemoryMerkleTree, InMemoryStorage } from './src/helpers/inmemory';
import { CircuitsFs } from './src/helpers/circuitsfs';

interface TestConfig {
  studentId: string;
  employerId: string;
  credentialType: string;
  expirationDate: string;
  rpcUrl: string;
  stateContractAddr: string;
  chainId: number;
  circuitsPath: string;
}

const DEFAULT_CONFIG = {
  rpcUrl: 'https://rpc-amoy.polygon.technology/',
  stateContractAddr: '0x1a4cc30f2aa0377b0c3bc9848766d90cb4404124',
  chainId: 80002,
  circuitsPath: path.join(__dirname, 'circuits')
};

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

enum TestFlow {
  COMPLETE_LIFECYCLE = '1',
  CREDENTIAL_TAMPERING = '2',
  ISSUE_ONLY = '3',
  VERIFY_ONLY = '4'
}

async function selectTestFlow(): Promise<TestFlow> {
  const rl = createInterface();
  console.log('\nSelect Test Flow:\n');
  console.log('1. Complete Lifecycle');
  console.log('2. Credential Tampering Test');
  console.log('3. Issue Credential Only');
  console.log('4. Verify Credential Only');
  const choice = await prompt(rl, 'Enter your choice (1-4): ');
  rl.close();
  if (!Object.values(TestFlow).includes(choice as TestFlow)) {
    console.log('\nRunning Complete Lifecycle');
    return TestFlow.COMPLETE_LIFECYCLE;
  }
  return choice as TestFlow;
}

async function getConfigFromUser(flow: TestFlow): Promise<TestConfig> {
  const rl = createInterface();
  const studentId = await prompt(rl, 'Enter Student ID (e.g., STU001): ');
  let employerId = 'N/A';
  if (flow === TestFlow.COMPLETE_LIFECYCLE || flow === TestFlow.VERIFY_ONLY) {
    employerId = await prompt(rl, 'Enter Employer ID (e.g., EMP001): ');
  }
  const credentialType = await prompt(rl, 'Enter Credential Type (default: DegreeCredential): ') || 'DegreeCredential';
  const expirationDays = await prompt(rl, 'Enter expiration days from now (default: 365): ') || '365';
  rl.close();
  const expirationDate = new Date(Date.now() + parseInt(expirationDays) * 24 * 60 * 60 * 1000).toISOString();
  return {
    studentId,
    employerId,
    credentialType,
    expirationDate,
    ...DEFAULT_CONFIG
  };
}

interface WalletContext {
  holderWallet: IdentityWallet;
  credWallet: CredentialWallet;
  proofService: ProofService;
  holderDid: string;
  STATE_FILE: string;
  seedPhrase: string;
}

async function initializeWalletAndServices(CONFIG: TestConfig): Promise<WalletContext> {
  console.log('Configuration:', {
    studentId: CONFIG.studentId,
    employerId: CONFIG.employerId,
    credentialType: CONFIG.credentialType,
    chainId: CONFIG.chainId,
    stateContractAddr: CONFIG.stateContractAddr
  });
  console.log('Initializing blockchain');
  try {
    await initializeBlockchain();
  } catch (error) {
    console.error('Blockchain init failed:', error);
    throw error;
  }
  console.log('Setting up wallet and KMS');
  const keyStore = new InMemoryPrivateKeyStore();
  const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, keyStore);
  const kms = new KMS();
  kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);
  console.log('Configuring storage layers');
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
  const resolvers = new CredentialStatusResolverRegistry();
  resolvers.register(
    CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
    new RHSResolver(dataStorage.states)
  );
  const credWallet = new CredentialWallet(dataStorage, resolvers);
  const holderWallet = new IdentityWallet(kms, dataStorage, credWallet);
  const circuits = new CircuitsFs();
  console.log('Loading schemas');
  const defLoader = jsonLDMerklizer.getDocumentLoader();
  const docLoader = async (url: string) => {
    if (url === 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld') {
      const ctxt = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas/DegreeCredential-v1.json-ld'), 'utf-8'));
      return {
        contextUrl: null,
        document: ctxt,
        documentUrl: url
      };
    }
    if (url === 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json') {
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas/DegreeCredential-v1.json'), 'utf-8'));
      return {
        contextUrl: null,
        document: schema,
        documentUrl: url
      };
    }
    return defLoader(url);
  };
  console.log('Setting up proof service');
  const proofService = new ProofService(
    holderWallet,
    credWallet,
    circuits,
    dataStorage.states,
    {
      documentLoader: docLoader
    }
  );
  console.log('Creating holder identity');
  const STATE_FILE = path.join(__dirname, 'testdata', `wallet-${CONFIG.studentId}.json`);
  let seedPhrase: string;
  if (fs.existsSync(STATE_FILE)) {
    console.log('Found existing wallet for', CONFIG.studentId);
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    seedPhrase = state.seedPhrase;
  } else {
    console.log('Generating deterministic seed from student ID');
    seedPhrase = crypto.createHash('sha256').update(`student:${CONFIG.studentId}`).digest('hex');
  }
  const { did } = await holderWallet.createIdentity({
    method: core.DidMethod.Iden3,
    blockchain: core.Blockchain.Polygon,
    networkId: core.NetworkId.Amoy,
    seed: crypto.createHash('sha256').update(seedPhrase).digest(),
    revocationOpts: { type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof, id: 'https://rhs-staging.polygonid.me' }
  });
  const holderDid = did.string();
  console.log('Holder DID:', holderDid);
  const db = getSupabaseClient();
  const { data: existingBinding } = await db
    .from(Tables.DID_BINDINGS)
    .select('did')
    .eq('student_id', CONFIG.studentId)
    .single();
  if (existingBinding) {
    console.log('DID already bound to student');
  } else {
    console.log('Binding DID to student in database');
    const { error: bindError } = await db.from(Tables.DID_BINDINGS).insert({
      student_id: CONFIG.studentId,
      did: holderDid,
      status: 'active'
    });
    if (bindError) {
      console.error('Failed to bind DID:', bindError.message);
      throw new Error(`Failed to bind DID: ${bindError.message}`);
    }
  }
  return {
    holderWallet,
    credWallet,
    proofService,
    holderDid,
    STATE_FILE,
    seedPhrase
  };
}

async function getOrIssueCredential(CONFIG: TestConfig, context: WalletContext): Promise<any> {
  const CRED_FILE = path.join(__dirname, 'testdata', `credentials-${CONFIG.studentId}.json`);
  let savedCred: any = null;
  if (fs.existsSync(CRED_FILE)) {
    const credData = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
    savedCred = credData.credential;
  }
  let credential;
  if (savedCred) {
    console.log('Using saved credential');
    credential = savedCred;
    console.log('Credential ID:', credential.id);
  } else {
    console.log('Issuing new credential');
    const issuerService = new IssuerService();
    const credSubject = {
      id: context.holderDid,
      university: 'Arizona State University',
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      graduationYear: 2025,
      gpa: 3.8,
      honors: 'Blockchain'
    };
    console.log('Subject:', credSubject);
    console.log('Expires:', CONFIG.expirationDate);
    const issuedRes = await issuerService.issueCred({
      student_id: CONFIG.studentId,
      credential_type: CONFIG.credentialType,
      expiration_date: CONFIG.expirationDate,
      credential_subject: credSubject
    });
    if (!issuedRes.success || !issuedRes.cred_id) {
      console.error('Issuance failed:', issuedRes.error);
      throw new Error(`Issuance failed: ${issuedRes.error}`);
    }
    console.log('Issued successfully, ID:', issuedRes.cred_id);
    console.log('Fetching credential data');
    const issuedResp = await issuerService.fetchCredentialData(issuedRes.cred_id);
    credential = issuedResp.body.credential;
    fs.writeFileSync(CRED_FILE, JSON.stringify({
      credential,
      studentId: CONFIG.studentId,
      issuedAt: new Date().toISOString()
    }, null, 2));
    console.log('Saved credential to', CRED_FILE);
  }
  console.log('Credential Details:');
  console.log('  ID:', credential.id);
  console.log('  Issuer:', credential.issuer);
  console.log('  Issued:', credential.issuanceDate);
  console.log('  Expires:', credential.expirationDate);
  console.log('  Type:', credential.type);
  console.log('  Subject:', JSON.stringify(credential.credentialSubject, null, 2));
  if (credential.credentialStatus) {
    console.log('  Status Type:', credential.credentialStatus.type);
    console.log('  Status ID:', credential.credentialStatus.id);
  }
  const w3cCredential = W3CCredential.fromJSON(credential);
  await context.credWallet.save(w3cCredential);
  console.log('Loaded to wallet');
  return credential;
}

async function runCompleteLifecycle(CONFIG: TestConfig, context: WalletContext) {
  console.log('Running Complete Lifecycle');
  await getOrIssueCredential(CONFIG, context);
  console.log('Starting verification');
  const verifierService = new VerifierService();
  const verifyConf = {
    credentialType: CONFIG.credentialType,
    allowedIssuers: ['*'],
    schemaUrl: 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld',
    constraints: [
      { field: 'degree', operator: '$eq' as const, value: 'Bachelor of Science' }
    ]
  };
  console.log('Creating verification session with employer:', CONFIG.employerId);
  console.log('Constraints:', verifyConf.constraints);
  const { session } = await verifierService.createVerifySession(verifyConf, CONFIG.employerId);
  console.log('Session created:', session.id);
  console.log('Getting proof request');
  const proofReq = await verifierService.getProofRequest(session.id) as any;
  console.log('Request ID:', proofReq.id);
  console.log('Thread ID:', proofReq.thid);
  console.log('Generating ZK proof');
  const scope = proofReq.body.scope[0];
  const zkRequest = {
    id: 1,
    circuitId: scope.circuitId as CircuitId,
    query: scope.query,
    optional: false
  };
  console.log('Circuit:', zkRequest.circuitId);
  console.log('Query:', JSON.stringify(zkRequest.query, null, 2));
  const { did } = await context.holderWallet.createIdentity({
    method: core.DidMethod.Iden3,
    blockchain: core.Blockchain.Polygon,
    networkId: core.NetworkId.Amoy,
    seed: crypto.createHash('sha256').update(context.seedPhrase).digest(),
    revocationOpts: { type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof, id: 'https://rhs-staging.polygonid.me' }
  });
  const zkResponse = await context.proofService.generateProof(zkRequest, did);
  console.log('Proof generated');
  console.log('Proof ID:', zkResponse.id);
  console.log('Public signals:', zkResponse.pub_signals);
  console.log('Submitting proof to verifier');
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
    from: context.holderDid
  };
  const verifiedResult = await verifierService.handleProofCallback(session.id, proofResp as any);
  if (verifiedResult.verified) {
    console.log('VERIFICATION SUCCESS');
    console.log('Disclosed attributes:', verifiedResult.disclosed_attributes);
  } else {
    console.error('VERIFICATION FAILED');
    console.error('Reason:', verifiedResult.failure_reason);
    if (verifiedResult.errors) {
      console.error('Errors:', verifiedResult.errors);
    }
  }
  console.log('Lifecycle complete');
}

async function runCredentialTamperingTest(CONFIG: TestConfig, context: WalletContext) {
  console.log('Credential Tampering Test');
  const credential = await getOrIssueCredential(CONFIG, context);
  console.log('Tring to change GPA: 3.8 → 4.0');
  const tamperedCred = JSON.parse(JSON.stringify(credential));
  tamperedCred.credentialSubject.gpa = 4.0;
  try {
    const w3cTamperedCred = W3CCredential.fromJSON(tamperedCred);
    await context.credWallet.save(w3cTamperedCred);
    console.log('Wallet stores tampered credentials without signature verification');
  } catch (error) {
    console.log('Wallet rejected tampered credential');
    console.log('Error:', error instanceof Error ? error.message : error);
  }
  console.log('Attempting to generate ZK proof with tampered constraint (GPA = 4.0)');
  const verifierService = new VerifierService();
  const verifyConf = {
    credentialType: CONFIG.credentialType,
    allowedIssuers: ['*'],
    schemaUrl: 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld',
    constraints: [
      { field: 'gpa', operator: '$eq' as const, value: 4.0 }
    ]
  };
  const { session } = await verifierService.createVerifySession(verifyConf, CONFIG.employerId || 'TEST_EMP');
  console.log('Session:', session.id);
  try {
    const proofReq = await verifierService.getProofRequest(session.id) as any;
    const scope = proofReq.body.scope[0];
    const zkRequest = {
      id: 1,
      circuitId: scope.circuitId as CircuitId,
      query: scope.query,
      optional: false
    };
    const { did } = await context.holderWallet.createIdentity({
      method: core.DidMethod.Iden3,
      blockchain: core.Blockchain.Polygon,
      networkId: core.NetworkId.Amoy,
      seed: crypto.createHash('sha256').update(context.seedPhrase).digest(),
      revocationOpts: { type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof, id: 'https://rhs-staging.polygonid.me' }
    });
    const zkResponse = await context.proofService.generateProof(zkRequest, did);
    console.log('WARNING: Proof generated (should not happen)');
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
      from: context.holderDid
    };
    const verifiedResult = await verifierService.handleProofCallback(session.id, proofResp as any);
    if (verifiedResult.verified) {
      console.error('CRITICAL: Verification passed with tampered data!');
    } else {
      console.log('Verification correctly failed');
      console.log('Reason:', verifiedResult.failure_reason);
    }
  } catch (error) {
    console.log('Blockchain rejected tampered credential');
    console.log('Error:', error instanceof Error ? error.message : error);
  }
  console.log('Tampering test completed');
}

async function runIssueOnly(CONFIG: TestConfig, context: WalletContext) {
  console.log('Issue Credential Only');
  await getOrIssueCredential(CONFIG, context);
  console.log('Issuance completed');
}

async function runVerifyOnly(CONFIG: TestConfig, context: WalletContext) {
  console.log('Verify Credential Only');
  const CRED_FILE = path.join(__dirname, 'testdata', `credentials-${CONFIG.studentId}.json`);
  if (!fs.existsSync(CRED_FILE)) {
    throw new Error('No credential found. Run "Issue Credential Only" first.');
  }
  const credData = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  const credential = credData.credential;
  console.log('Found credential:', credential.id);
  console.log('Loading credential to wallet');
  const w3cCredential = W3CCredential.fromJSON(credential);
  await context.credWallet.save(w3cCredential);
  console.log('Starting verification');
  const verifierService = new VerifierService();
  const verifyConf = {
    credentialType: CONFIG.credentialType,
    allowedIssuers: ['*'],
    schemaUrl: 'https://kaushal-2001.github.io/DegreeIAM/DegreeCredential-v1.json-ld',
    constraints: [
      { field: 'degree', operator: '$eq' as const, value: 'Bachelor of Science' }
    ]
  };
  const { session } = await verifierService.createVerifySession(verifyConf, CONFIG.employerId);
  console.log('Session:', session.id);
  const proofReq = await verifierService.getProofRequest(session.id) as any;
  console.log('Generating proof');
  const scope = proofReq.body.scope[0];
  const zkRequest = {
    id: 1,
    circuitId: scope.circuitId as CircuitId,
    query: scope.query,
    optional: false
  };
  const { did } = await context.holderWallet.createIdentity({
    method: core.DidMethod.Iden3,
    blockchain: core.Blockchain.Polygon,
    networkId: core.NetworkId.Amoy,
    seed: crypto.createHash('sha256').update(context.seedPhrase).digest(),
    revocationOpts: { type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof, id: 'https://rhs-staging.polygonid.me' }
  });
  const zkResponse = await context.proofService.generateProof(zkRequest, did);
  console.log('Submitting proof');
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
    from: context.holderDid
  };
  const verifiedResult = await verifierService.handleProofCallback(session.id, proofResp as any);
  if (verifiedResult.verified) {
    console.log('VERIFICATION SUCCESS');
    console.log('Disclosed attributes:', verifiedResult.disclosed_attributes);
  } else {
    console.error('VERIFICATION FAILED');
    console.error('Reason:', verifiedResult.failure_reason);
  }
  console.log('Verification completed');
}

async function runTestCycle(flow: TestFlow, CONFIG: TestConfig) {
  const context = await initializeWalletAndServices(CONFIG);
  switch (flow) {
    case TestFlow.COMPLETE_LIFECYCLE:
      await runCompleteLifecycle(CONFIG, context);
      break;
    case TestFlow.CREDENTIAL_TAMPERING:
      await runCredentialTamperingTest(CONFIG, context);
      break;
    case TestFlow.ISSUE_ONLY:
      await runIssueOnly(CONFIG, context);
      break;
    case TestFlow.VERIFY_ONLY:
      await runVerifyOnly(CONFIG, context);
      break;
    default:
      throw new Error(`Unknown: ${flow}`);
  }
}

async function main() {
  while (true) {
    try {
      const flow = await selectTestFlow();
      const config = await getConfigFromUser(flow);
      await runTestCycle(flow, config);
      const rl = createInterface();
      const runAgain = await prompt(rl, 'Run another test (yes/no): ');
      rl.close();
      if (runAgain.toLowerCase() !== 'yes' && runAgain.toLowerCase() !== 'y') {
        console.log('Done');
        process.exit(0);
      }
    } catch (error) {
      console.error('Test failed:', error);
      if (error instanceof Error && error.stack) {
        console.error('Stack:', error.stack);
      }
      const rl = createInterface();
      const retry = await prompt(rl, 'Try again (yes/no): ');
      rl.close();
      if (retry.toLowerCase() !== 'yes' && retry.toLowerCase() !== 'y') {
        console.log('Exiting');
        process.exit(1);
      }
    }
  }
}

main();
