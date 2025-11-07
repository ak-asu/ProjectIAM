/**
 * Handles on-chain credential issuance using Privado ID
 * 1. Admin prepares a credential for an authenticated student
 * 2. Call Privado ID Issuer Node with the credential data
 * 3. Issuer Node creates a merkle tree and publishes the state root on-chain
 * 4. Generate an offer QR code for the student
 * 5. Student scans QR with Privado Wallet to receive credential
 */