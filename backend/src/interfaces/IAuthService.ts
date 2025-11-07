/**
 * Handles DID-based authentication with optional username/password binding
 * 1. User scans QR code (iden3comm authorization request)
 * 2. Privado Wallet performs DID authentication
 * 3. Wallet sends authorization response to callback
 * 4. Backend verifies the proof using Verifier SDK
 * 5. For first-time users we need to prompt for university credentials to bind the DID
 * 6. Session is created for authenticated user
 */