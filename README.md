# Unicredify - Decentralized Identity and Access Management (IAM) for University Credentials Verification System

This project implements a privacy-preserving decentralized Identity and Access Management system for university credentials. It is inspired by platforms like UniCred.io with an innovation to introduce zero-knowledge proofs for enhanced privacy. The system enables universities to issue verifiable digital credentials to students who can then selectively share these credentials with employers while maintaining complete control and data integrity. It is built on the Polygon blockchain and integrated with Privado ID infrastructure. The application has on-chain credential anchoring for authenticity and off-chain zero-knowledge proof verification for efficiency and privacy.

## Overview

The system consists of three main components:

1. **Holder (Student)**: Uses Privado ID Wallet to store credentials, generate ZK proofs and control access
2. **Issuer (University)**: Authenticates students, issues credentials via Issuer Node and manages revocation
3. **Verifier (Employer)**: Requests credential proofs and verifies them off-chain

Understanding the flow:

1. A student completes their degree at a university
2. The university issues a digital credential containing degree information
3. The student receives, signs and stores the credential in their Privado ID Wallet
4. When applying for a job, the student shares only necessary information without revealing extra information
5. The employer verifies the credential authenticity instantly without contacting the university
6. All verification happens off-chain for efficiency

## How It Works

**Students** download the Privado ID Wallet app and create their decentralized identity (DID). When they visit their university's credential portal, they scan a QR code to authenticate (no passwords needed). First-time users bind their DID with their university account to prove they are really them.

**Universities** set up an Issuer Node and define what their credentials look like (degree type, major, graduation date, etc.). When it's time to issue a credential, an admin triggers the process and the system creates a tamper-proof digital credential. The credential's fingerprint gets stored on the blockchain (Polygon Amoy) while the student receives the full credential in their wallet.

**Employers** create verification requests through the verifier portal. They specify what they need to check like maybe just the degree type or graduation year, etc. The system generates a QR code that students scan with their wallet.

When a student shares their credential, they are not handing over all their data. They generate a zero-knowledge proof that reveals only what the employer asked for. The proof is cryptographically verified off-chain, so it is fast and cheap.

When you call `issueCredential()`:

```
User signs transaction with private key
   ↓
Transaction sent to blockchain network
   ↓
Validators pick it up
   ↓
Smart contract code executes
   ↓
Data written to blockchain
   ↓
Event emitted
   ↓
Transaction confirmed
   ↓
credId returned to caller
```

Off-chain Verification Basic Flow

```
Holder presents credential
   ↓
Verifier checks your contract with isCredentialValid
   ↓
If valid, verifier uses Privado ID Verifier SDK
   ↓
SDK checks merkle roots match
   ↓
SDK verifies zero-knowledge proof
   ↓
Result is either Valid or Invalid
```

## Features

- **Privacy by design**: No personal information ever touches the blockchain as everything is just cryptographic hashes
- **Student control**: You decide what to share and with whom
- **Instant verification**: Employers verify credentials quickly without calling the university
- **Revocation support**: Universities can invalidate credentials if needed
- **Tamper-proof**: Credentials are cryptographically signed and cannot be forged
- **Selective disclosure**: Share only the specific fields requested and nothing more

## Technology Stack

### Blockchain & Identity Layer
- **Blockchain Network**: Polygon Amoy Testnet
- **DID Method**: Privado ID (Polygon ID)
- **State Contract**: value string on Amoy
- **Identity Protocol**: Iden3comm for authentication, credential offers and proof requests
- **Wallet**: Privado ID Wallet in mobile app

### Backend & Services
- **Backend Framework**: Node.js with Express.js or Next.js API routes
- **Issuer Node**: Privado ID Issuer Node (merklized credential issuance)
- **Verifier SDK**: Privado ID Verifier Library (off-chain proof verification)
- **Database**: Supabase (session management, student bindings, logs and more)
- **Off-chain Storage**: IPFS via Pinata (encrypted credential documents)

### Frontend
- **UI Framework**: Next.js 14+ with TypeScript
- **Styling**: Tailwind CSS
- **Web3 Integration**: Ethers.js for blockchain interaction
- **QR Code**: QRCode.js for generating authentication and credential offer QRs

### Smart Contracts
- **Language**: Solidity ^0.8.20
- **Development**: Hardhat framework
- **State Management**: On-chain state roots for credential claims and revocation

### Policy & Access Control
- **Policy Engine**: Custom ABAC (Attribute-Based Access Control) (optionally explore Open Policy Agent)
- **Consent Management**: Time-based and purpose-based access policies
- **Selective Disclosure**: JSON-LD credential processing with field filtering

## Dependencies and Setup Instructions

### Prerequisites

Before you start, make sure you have these installed:

- **Node.js v22.20.0+** and **npm v11.1.0+** - Download from [nodejs.org](https://nodejs.org/)
- **Supabase account** - Sign up at [supabase.com](https://supabase.com/) for the PostgreSQL database
- **Polygon Amoy RPC URL** - Get a free API key from [Alchemy](https://www.alchemy.com/)
- **Wallet with testnet MATIC** - You will need some Amoy testnet tokens for deploying contracts (get from [Polygon faucet](https://faucet.polygon.technology/))
- **Privado ID Wallet** - Download the mobile app from [Google Play](https://play.google.com/store/apps/details?id=com.polygonid.wallet)
- **Privado ID Issuer Node** - Either deploy your own or use an existing instance (optional for initial setup)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/ak-asu/ProjectIAM.git
cd ProjectIAM
```

2. **Install all dependencies in each workspace (backend, frontend, contracts)**
```bash
cd backend && npm install
cd ../frontend && npm install
cd ../contracts && npm install
cd ..
```

3. **Set up environment variables**

Copy the sample env files and fill in your values:

```bash
cp .env.sample .env
cp backend/.env.sample backend/.env
cp frontend/.env.sample frontend/.env
cp contracts/.env.sample contracts/.env
```
Put your values and keep updating as we move forward in the setup.

4. **Set up the database**

Create a new Supabase project and get the connection URL and API keys.
Run bacend/schema.sql to create all tables in Supabase SQL Editor.

5. **Compile and deploy smart contracts**

First compile the contracts:
```bash
cd contracts
npx hardhat compile
```

Then deploy to Amoy testnet (cheap and fast instead of mainnet):
```bash
npx hardhat run scripts/deploy.js --network amoy
```
Check the output in contracts/deployments/amoy-deploy.json.
Add them to your backend and frontend `.env` files.

6. **Start the development servers in separate terminals**

```bash
cd frontend
npm run dev
```

```bash
cd backend
npm run dev
```

The frontend will be available at `http://localhost:3000` or your specified port.

### Testing

```bash
cd contracts
npm run test
```

```bash
cd backend
npx ts-node test-lifecycle.ts
```
Dummy data can be found in end of backend/schema.sql

### Deployment

1. Update environment variables for production endpoints
2. Deploy smart contracts to Polygon mainnet
3. Deploy backend/schemas to Github Pages or your hosting provider and update the url values in them
4. Deploy frontend on Vercel
5. Deploy backend on Render
6. Update CORS settings and ensure all endpoints use HTTPS

### Security Considerations

- **Privacy**: No PII on blockchain. Only hashes and state roots
- **Encryption**: Credentials encrypted before IPFS storage
- **Authentication**: Multi-factor (DID + password binding for first-time)
- **Session Management**: Time-limited sessions with nonce binding
- **Revocation**: Real-time revocation checking before verification
- **Audit Trail**: Immutable logs with cryptographic integrity
- **HTTPS and CORS**: All endpoints require HTTPS in production and are restricted to authorized domains

## Usage

Check blockchain transaction status on Polygonscan

### For Students (Holders)

1. Install the Privado ID mobile app from Play Store. Open the wallet and create a new identity.
2. Authenticate with Your University Portal:
   - Visit your application's student portal
   - Click "Authenticate with DID"
   - Scan the QR code displayed with your Privado ID wallet
   - Approve the authentication request in your wallet
   - After DID authentication, enter your university email and password to bind the DID with your student account
   - Future logins will only require scanning the QR code
3. Receive Credential:
   - Once the university issues your credential, scan the credential offer QR code with your Privado ID wallet
   - Tap "Claim" to import the credential into your wallet
4. Verification Request:
   - The employer will provide a verification QR code
   - Scan the QR code with your Privado ID wallet
5. Approve Sharing:
   - The wallet shows what information the employer is requesting
   - Tap "Accept" to generate and submit a zero-knowledge proof
   - The employer receives instant verification without accessing your full transcript

### For Universities (Issuers)
1. Access the University Portal:
   - Navigate to university portal
   - Authenticate using the admin API key
2. Issue the Credential:
   - Enter student ID and credential details
   - Click "Issue Credential"
   - The system processes the issuance (20-30 seconds):
     - Creates a W3C Verifiable Credential
     - Anchors the credential on the Polygon blockchain
     - Encrypts and stores the credential on IPFS
     - Generates a credential offer QR code
   - Display or email the QR code to the student, so he can accept it in his wallet
3. Revoke a Credential:
   - Navigate to the Manage Credential tab
   - Click "Revoke"
   - Enter a required reason and confirm
   - The credential is immediately invalidated on the blockchain
   - Future verification attempts will fail with the revocation reason

### For Employers (Verifiers)

1. Log in with email and password configured in database
2. Set requirements or constraints for verification policy like:
   - Graduation year must be after 2025
   - GPA must be at least 3.0
   - Degree must be in Computer Science
3. Generate Verification QR Code:
   - Click "Generate QR"
   - The system creates a unique verification session
   - Display the QR code to the candidate, which he scans using Privado ID wallet
4. The verification portal automatically refreshes when the candidate responds (30-60 seconds)

**Understanding Zero-Knowledge Verification**

- Verification happens instantly without contacting the university
- The candidate's wallet generates a cryptographic proof that reveals only what you requested
- You get strong assurance of authenticity through blockchain verification
- The candidate maintains privacy where you do not see their full academic record
- The verification is tamper-proof where credentials cannot be altered

### Common Workflows

**Workflow 1: Student Receives Degree Credential**
```
University Admin → Select Student → Configure Credential → Issue → Generate QR
Student → Scan QR → Claim → Credential Stored in Wallet
```

**Workflow 2: Employer Verifies Candidate's Degree**
```
Employer → Create Verification Request → Set Policy → Generate QR
Candidate → Scan QR → Review Request → Approve Sharing → Generate Proof
Employer → Receive Instant Verification → View Results → Download Report
```

**Workflow 3: University Revokes Credential**
```
University Admin → Locate Credential → Click Revoke → Enter Reason → Confirm
System → Update Blockchain → Mark as Revoked → Log Audit Trail
Future Verifications automatically fail with Revocation reason
```

## License

This project is licensed under the MIT License.
