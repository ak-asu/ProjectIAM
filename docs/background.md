# Background

> **Purpose:** Explain the *why* and *how* behind DIDs, VCs, ZKPs, Merkle states, Iden3comm, and the roles of Wallet, Issuer Node, Verifier SDK — with enough intuition to implement and reason about the system safely.

---

## 1) Why decentralized identity (DID/VC)?

Traditional identity flows centralize user data on servers and repeatedly disclose **full attributes** (e.g., name, degree, date of birth) even when the verifier only needs a **yes/no fact**. This creates:
- **Privacy leakage** (oversharing),
- **Single points of failure** (data breaches),
- **Poor portability** (vendor lock‑in).

**DIDs** (Decentralized Identifiers) and **VCs** (Verifiable Credentials) invert this. The user (Holder) controls identifiers and stores credentials client‑side; Issuers sign credentials; Verifiers check cryptographic proofs — **not plaintext** — to learn only what they asked for.
Example:

---

## 2) DID — Decentralized Identifiers (intuition)

A DID is an identifier like `did:polygonid:...`. Behind each DID is a **private key** known only to the Holder (or Issuer). Holding the private key proves control over the DID — analogous to owning a house key that fits a unique lock. The DID can be *resolved* to learn how to verify signatures made by this identity (its public keys).

**Key takeaways:**
- You never “log in” by sending a password; you **prove control** of a DID by generating a cryptographic proof.
- DIDs are **portable**; switching apps does not create new accounts — the same DID can authenticate anywhere it is trusted.
```json
{
  "id": "did:polygonid:polygon:amoy:0xabc123...",
  "verificationMethod": [{
    "id": "did:polygonid:polygon:amoy:0xabc123#keys-1",
    "type": "EcdsaSecp256k1VerificationKey2019",
    "controller": "did:polygonid:polygon:amoy:0xabc123...",
    "publicKeyHex": "03d1aef9..."
  }]
}
```

Note:
- `id` is public-accessible and represents an entity (e.g. user or school).

---

## 3) VC — Verifiable Credentials (intuition)

A VC is like a **digitally signed PDF** — except it’s a **JSON** with structured fields (e.g., degree, major, year) and a cryptographic signature from the Issuer. The Holder keeps the VC locally. When a Verifier asks, the Holder generates a **proof** (zero‑knowledge if desired) attesting to exactly what’s needed (e.g., “has a Bachelor’s degree from ABC University”) **without exposing extra fields**.

**Key takeaways:**
- VC plaintext does **not** go on chain.
- Users keep VCs **encrypted** in the wallet.
- Issuers can **revoke** later; Verifiers check revocation via state roots.
Example:
```json
{
  "id": "did:polygonid:polygon:amoy:0xabc123...",
  "verificationMethod": [{
    "id": "did:polygonid:polygon:amoy:0xabc123#keys-1",
    "type": "EcdsaSecp256k1VerificationKey2019",
    "controller": "did:polygonid:polygon:amoy:0xabc123...",
    "publicKeyHex": "03d1aef9..."
  }]
}
```
---

## 4) Zero‑Knowledge Proofs (intuition, no math)

A zero‑knowledge proof (ZKP) lets the Holder convince a Verifier that a statement is true **without showing the underlying data**. For example: “I hold a valid degree credential from issuer X for university=ABC” — without disclosing your name or student number. ZKPs protect privacy by revealing only the **truth of a predicate**, not the raw values.

**Why it matters here:** The degree credential remains private in the wallet; only a proof is shown. The verifier can’t leak what they don’t see.

---

## 5) Merkle trees, state roots, and membership proofs (MTP)

**Merkle tree**: A binary hash tree whose root summarizes a set of leaves.
**Membership proof (MTP)**: A small path of hashes that proves a specific **leaf** is part of the Merkle root.

**Privado/Polygon ID** uses Merkle trees to maintain **Issuer state** (e.g., claims and revocations). The **Issuer Node** adds a leaf for a new credential, updates the tree, and publishes the new **root** to a **chain** (e.g., Polygon). This gives:
- **Integrity**: Everyone can see the root; Issuer can’t lie later without changing the root.
- **Revocation**: A separate revocation tree enables “this credential is no longer valid”.

During issuance, the Issuer Node returns an **MTP** that ties the credential’s claim to the current on‑chain root. Verifiers check the proof path against the root (or use ZK circuits that internalize this path).

---

## 6) What exactly goes on chain?

**Only the state roots** (Merkle roots). No PII, no VC plaintext. Think of it as a public **index** proving “some signed data exists and is either valid or revoked” without revealing content.

---

## 7) Roles and responsibilities (mental model)

- **Holder (Privado Wallet)**: Personal vault. Stores VC; computes Auth proof; computes ZK proofs. No server stores the VC plaintext.
- **Issuer Node (University’s node)**: Converts claims → Merkle leaves; updates on‑chain roots; produces proofs (MTP). It signs as the **Issuer DID**.
- **Verifier (Backend + Verifier SDK)**: Requests a proof, receives it via callback, validates **off‑chain** using SDK + on‑chain state via RPC.

---

## 8) Iden3comm — the message protocol that glues everything

Iden3comm standardizes how Wallet, Issuer, and Verifier communicate through **QR codes/deep links** and **HTTP callbacks**.

- **authorization/1.0/request | response** — “Prove you control DID X.” (DID Auth)
- **credentials/1.0/offer** — “Here’s how to fetch your credential.” (Issuance to wallet)
- **proofs/1.0/request | response** — “Prove a predicate about your credential.” (Verification)

Each message is a JSON with a `type` and a `body`. The QR encodes `iden3comm://?request_uri=https://.../path` — the wallet fetches the JSON, acts, and then POSTs the **response** to the `callbackUrl` indicated by the request’s body.

---

## 9) Off‑chain vs On‑chain verification

- **On‑chain verification** = a smart contract checks a proof; costs gas, public, slower.
- **Off‑chain verification** = a server uses the **Verifier SDK**; reads on‑chain state (roots) via RPC; faster, private, and cheaper.

For degree checks, **off‑chain** is ideal: private, free for verifiers, still anchored to chain state.

---

## 10) Security model & privacy model

- **Private by default**: VC plaintext stays in the wallet; requests ask for predicates, not raw fields.
- **Minimal disclosure**: Verifier only learns the yes/no outcome of the query (and possibly which issuer signed it).
- **Replay protection**: Auth/Proof requests include a **nonce** (challenge) and short TTL; responses are bound to the original request.
- **Revocation**: Every verification checks state freshness; revoked credentials fail verification.
- **No password reuse**: The simple username/password is **only** for local university binding and never leaves the backend.
- **Separation of concerns**: DID keys ≠ encryption keys; wallet manages DID keys; our backend does not touch user private keys.

---

## 11) Data lifecycle (where data lives)

| Data                         | Where it lives                 | Who can read it |
|-----------------------------|--------------------------------|------------------|
| VC plaintext                | **Wallet** (encrypted local)   | Holder only      |
| Issuer state roots          | **Chain** (public)             | Anyone           |
| University directory        | **Backend DB**                 | Backend admins   |
| DID↔student binding         | **Backend DB**                 | Backend          |
| Proof requests & responses  | **Backend** (short‑lived)      | Backend          |

---

## 12) Threats & mitigations (quick table)

| Threat | Mitigation |
|-------|------------|
| Stolen QR or replay | Nonce + session TTL + bind response to original request |
| Fake issuer | Verifiers whitelist **Issuer DID**; wallets show issuer name/ DID |
| Data breach | No VC plaintext on backend; only hashes/IDs; minimize PII |
| Revocation bypass | Verifier SDK always fetches latest state root via RPC |
| Phishing | Wallet UX shows **who** is asking and for **what**; users approve |
| Key loss (holder) | Recover by re‑issuance (university policy), not by server‑side copies |

---

## 13) Glossary (fast reference)

- **DID**: Decentralized Identifier controlled by a private key.
- **VC**: Verifiable Credential (signed JSON).
- **ZKP**: Zero‑knowledge proof (prove a statement without revealing data).
- **MTP**: Merkle Tree Proof (path proving inclusion under root).
- **State contract**: On‑chain contract storing issuer state roots.
- **Iden3comm**: Messaging protocol for Auth, Offer, and Proof flows.
- **Issuer Node**: Service that builds claims, updates state, returns VC + MTP.
- **Verifier SDK**: Library to validate Auth/Proof responses off‑chain.

---

## 14) What is *STANDARD* vs *Custom*?

**STANDARD:** Iden3comm message shapes, wallet callbacks, Privado Auth proof, Issuer Node merklized issuance, off‑chain verification via Verifier SDK.
**Custom:** University UI, simple username/password binding (first time only), and orchestration glue that calls Issuer Node and renders QRs.
