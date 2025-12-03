import {
  BjjProvider,
  CredentialStorage,
  CredentialWallet,
  defaultEthConnectionConfig,
  EthStateStorage,
  Identity,
  IdentityStorage,
  IdentityWallet,
  KMS,
  KmsKeyType,
  Profile,
  W3CCredential,
  EthConnectionConfig,
  ProofService,
  CredentialStatusType,
  InMemoryPrivateKeyStore,
  core
} from '@0xpolygonid/js-sdk';
import { config } from '../config';
import * as crypto from 'crypto';
import { InMemoryStroage, InMemoryMerkleTree } from './inmemory';
import { CircuitsFs } from './circuitsfs';


export class IssuerSDK {
  public static instance: IssuerSDK;
  public identityWallet: IdentityWallet;
  public credentialWallet: CredentialWallet;
  public proofService: ProofService;
  public stateStorage: EthStateStorage;
  public issuerDID: string | null = null;

  private constructor() {
    const ethConf: EthConnectionConfig = {
      ...defaultEthConnectionConfig,
      url: config.rpcUrl,
      contractAddress: config.stateContractAddress,
      chainId: config.chainId,
    };
    const credStorage = new CredentialStorage(
      new InMemoryStroage<W3CCredential>()
    );
    const identityStorage = new IdentityStorage(
      new InMemoryStroage<Identity>(),
      new InMemoryStroage<Profile>()
    );
    const mtStorage = new InMemoryMerkleTree(40);
    const ethStorage = new EthStateStorage(ethConf);
    this.stateStorage = ethStorage;
    const dataStorage = {
      credential: credStorage,
      identity: identityStorage,
      mt: mtStorage,
      states: ethStorage,
    };
    const memKeyStore = new InMemoryPrivateKeyStore();
    const bjjProvider = new BjjProvider(KmsKeyType.BabyJubJub, memKeyStore);
    const kms = new KMS();
    kms.registerKeyProvider(KmsKeyType.BabyJubJub, bjjProvider);
    this.credentialWallet = new CredentialWallet(dataStorage);
    this.identityWallet = new IdentityWallet(kms, dataStorage, this.credentialWallet);
    const circuits = new CircuitsFs();
    this.proofService = new ProofService(
      this.identityWallet,
      this.credentialWallet,
      circuits,
      ethStorage,
      { ipfsNodeURL: config.ipfsApiUrl || 'https://ipfs.io' }
    );
  }

  public static getInstance(): IssuerSDK {
    if (!IssuerSDK.instance) {
      IssuerSDK.instance = new IssuerSDK();
    }
    return IssuerSDK.instance;
  }

  public async initIdentity(): Promise<string> {
    if (this.issuerDID) return this.issuerDID;
    // seed should ne 32 bytes by hashing it
    const seed = crypto.createHash('sha256').update(config.issuerSeed).digest();
    try {
      const { did } = await this.identityWallet.createIdentity({
        method: core.DidMethod.Iden3,
        blockchain: core.Blockchain.Polygon,
        networkId: core.NetworkId.Amoy,
        seed: seed,
        revocationOpts: {
          type: CredentialStatusType.Iden3ReverseSparseMerkleTreeProof,
          id: 'https://rhs-staging.polygonid.me'
        }
      });
      if (typeof did === 'string') {
        this.issuerDID = did;
      } else if (typeof (did as any).string === 'function') {
        this.issuerDID = (did as any).string();
      } else if ((did as any).id) {
        const idVal = (did as any).id;
        if (typeof idVal === 'string') {
          this.issuerDID = idVal;
        } else {
          try {
            this.issuerDID = core.DID.parseFromId(idVal).string();
          } catch (e) {
            this.issuerDID = String(idVal);
          }
        }
      } else {
        this.issuerDID = String(did);
      }
      if (!this.issuerDID || this.issuerDID === '[object Object]') {
        throw new Error('Failed to generate IssuerDID, [object Object]');
      }
      if (!this.issuerDID) {
        throw new Error('Failed to generate IssuerDID, string');
      }
      console.log('Issuer identity initialized:', this.issuerDID);
      return this.issuerDID;
    } catch (error) {
      console.error('Failed to init identity:', error);
      throw error;
    }
  }
}
