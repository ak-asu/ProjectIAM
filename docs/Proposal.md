# ✅ Final Architecture (concise & actionable)

## High-level component list (actual responsibilities)

* **User Wallet / Holder Agent (student)**

  * Holds DID private key, stores VC(s) locally, builds selective disclosures, signs presentations.
* **Issuer Backend (University)**

  * Authenticates admin, issues VCs (JSON-LD/W3C VC), writes credential hash & issuance event to smart contract.
* **Verifier Portal / API (Employer)**

  * Requests presentation from wallet, verifies signatures, checks revocation & policy.
* **DID Registry / Resolver**

  * Resolves DID → DID Document (public keys, service endpoints). Can be a lightweight on-chain registry + resolver service.
* **Smart Contract Layer (on chain)**

  * *Functions*: register DID (optional), anchor credential hash, record issuance events, revocation registry pointer, store policy hashes (not policies), store minimal audit events.
* **Revocation Registry (off-chain index + on-chain anchor)**

  * Off-chain DB (fast lookup) with on-chain root/hash for integrity.
* **Policy & Access Engine (off-chain)**

  * Evaluates ABAC/consent/time policies. Exposes endpoint used by Verifier. (Can be simple rule engine/OPA).
* **Off-chain Storage (IPFS / Cloud)**

  * Stores full transcript PDF / VC payload encrypted; smart contract stores the content hash (CID).
* **Audit & Compliance Module (off-chain + on-chain pointers)**

  * Stores human-readable logs and analytics off-chain; anchors periodic merkle root on chain for tamper evidence.
* **Integration Adapters (SIS, LMS, HR)**

  * Connects Issuer to Student Information System for automated issuance.
* **Gateway / Verification Service (public API)**

  * URL endpoints to view/verify credential (fetches on-chain + off-chain, returns verified result).
* **Optional ZKP Module**

  * Produces/consumes zk proofs for selective disclosure (advanced; optional).
* **Key Recovery Service (optional)**

  * Social recovery or custodial recovery options (UI + off-chain logic).

---

## On-chain vs Off-chain decisions (practical)

* **On-chain (smart contracts)**: DID registration (optional), credential *hashes* (CID), issuance events (minimal), revocation *pointers* or merkle root, policy *hashes*, and periodic audit merkle roots.
* **Off-chain**: full credential documents, dynamic policies, revocation index, policy engine, analytics, UI session data.
  *Reason:* reduce gas cost and latency; keep PII off-chain for privacy/GDPR.

---

## Data flow — ASCII diagram (main happy paths)

```
[University SIS] --> [Issuer Backend] --> creates VC (JSON-LD) -->
    ├─> store encrypted VC on IPFS (CID)
    ├─> compute hash = H(VC)
    └─> call SmartContract.issueCredential(studentDID, hash, cid, meta)
                ↓ transaction on chain
[Student Wallet] ← receives VC (via Issuer or QR link)
    • holds VC, defines access policy (consent/time)
---------------------------------------------------------
Verification:
[Employer Verifier Portal] --request--> [Student Wallet]
    • Wallet sends signed Presentation (selective disclosure)
    ↓
[Verifier Portal] -> Fetch DID doc via Resolver -> Verify signature
                -> Query SmartContract revocation/issue event -> Query Revocation index
                -> Call Policy Engine for ABAC/consent
                -> Return verified / denied
                -> Log event to Audit Module (off-chain) ; optionally anchor root on-chain
```

---

## Key sequences (step-by-step)

### 1) **Issuance**

1. Admin in University authenticates to Issuer Backend (SIS integration).
2. Issuer creates VC (signed by university key), uploads encrypted VC to IPFS (CID).
3. Issuer calls `SmartContract.issueCredential(studentDID, hash(H(VC)), cid, schemaId, timestamp)`.
4. Student receives VC in wallet (push or QR/URL).

### 2) **Verification (employer)**

1. Employer requests VC from student (via wallet UI).
2. Student wallet builds Presentation (selective disclosure) and signs it.
3. Verifier checks: a) DID doc (resolve), b) signature(s), c) on-chain issuance hash equals H(presented VC), d) revocation status, e) policy engine (ABAC).
4. Verifier returns decision and logs event.

### 3) **Revocation**

1. University triggers revocation in Revocation Module.
2. Off-chain revocation index updated (fast lookup); update merkle root & anchor root to smart contract `revokePointer` (cheap).
3. Verifiers consult off-chain index; if mismatch with on-chain anchor -> alert.

### 4) **Policy & Consent Enforcement**

* Policy Engine receives (VC attributes, request context, verifier identity) and evaluates ABAC + consent rules.
* Policy decision informs allow/deny and which fields to include in presentation.

### 5) **Audit & Compliance**

* Audit module receives event logs (issuance, verification, revocation) with timestamps and hashes; periodically computes merkle root and anchors on chain.

---

## Minimal viable scope (2-week / 5-person) — what to implement now

**Must-have (deliverable prototype):**

1. Smart contracts (Solidity, one contract): issue, anchor hash, query issuance, set revocation pointer.
2. Issuer backend (Node.js): create VCs, upload to IPFS, call contract.
3. Student Wallet (Web dApp): receive/store VC, create presentation (no full ZKP).
4. Verifier Portal (Web): request presentation, verify signature, check on-chain issuance & simple revocation lookup, simple ABAC (policy engine minimal).
5. IPFS integration for off-chain document storage.
6. Off-chain audit log (DB) and simple merkle root anchor function (periodic on chain).
7. Basic SIS integration simulated (CSV import) to automate issuance.

**Nice-to-have (if time allows):**

* Simple DID registry & resolver (or use existing DID method library).
* Basic key recovery (seed phrase + social recovery placeholder).
* Simple ZKP selective disclosure demo (optional library example).
* Simple cross-institution schema registry (static JSON file).

---

## Recommended Technology choices (practical & fast)

* Smart contracts: **Solidity** + **Hardhat** (local) / deploy to **Polygon Mumbai testnet** (cheap).
* Blockchain API: **Ethers.js**.
* DID/VC libraries: **did-jwt-vc**, **json-ld-signatures**, or **@digitalbazaar/crypto-ld** for quick VC handling.
* Off-chain storage: **IPFS (Pinata or Infura)**.
* Backend: **Node.js + Express** or Next.js API routes.
* Frontend: **Next.js + Tailwind**. Use **Web3Modal**/MetaMask for wallet demo or build minimal wallet UI that stores keys in browser (dev only).
* Policy Engine: lightweight custom ABAC rules (JSON) or **Open Policy Agent (OPA)** if comfortable.
* DB for off-chain indexes & audit: **Supabase / PostgreSQL**.
* Host: **Vercel + Infura/Alchemy** for RPC endpoints.

---

## Security & privacy notes (must do)

* Never store PII on chain. Store only hashes/CIDs.
* Encrypt credential files before adding to IPFS; store symmetric key in student's wallet or shared via encrypted channel.
* Use HTTPS for all endpoints; protect issuer admin routes.
* Implement signature checks and nonce/timestamp to prevent replay attacks.
* Design revocation so verifiers check fresh status (cache expiry small).

---

## Minimal component-to-person mapping (2-week split)

* Person A: Smart Contracts + Hardhat deployment + blockchain integration.
* Person B: Issuer Backend + IPFS integration + SIS adapter.
* Person C: Student Wallet UI + key management + presentation builder.
* Person D: Verifier Portal + policy engine + verification logic.
* Person E: Audit module + revocation service + documentation & testing.

---

## Final tips & pitf alls to avoid

* Keep on-chain writes minimal — use hashes/pointers only.
* Start with simple JSON-LD VCs (no ZKP) — selective disclosure can be simulated by removing fields.
* Use existing DID/VC libs to avoid reinventing crypto.
* Mock complex parts (recovery, federation) with simple placeholders if time runs out.
* Write unit tests for smart contracts and verification flow.

---