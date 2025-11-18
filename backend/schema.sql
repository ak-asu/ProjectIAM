CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Authentication sessions with DID verification
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did TEXT,
    did_verified BOOLEAN DEFAULT FALSE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    student_id TEXT,
    nonce TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_did ON sessions(did);
CREATE INDEX idx_sessions_student_id ON sessions(student_id);

-- University users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT DEFAULT 'student' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- DID to student account
CREATE TABLE IF NOT EXISTS did_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id TEXT UNIQUE NOT NULL,
    did TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    bound_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(student_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credential_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_hash TEXT NOT NULL,
    merkle_root TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    holder_did TEXT NOT NULL,
    student_id TEXT NOT NULL,
    issuer_did TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    schema_url TEXT NOT NULL,
    ipfs_cid TEXT NOT NULL,
    revocation_nonce INTEGER NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    revocation_reason TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    issued_by TEXT,
    FOREIGN KEY (student_id) REFERENCES users(student_id)
);

CREATE INDEX idx_credentials_holder ON credential_records(holder_did);
CREATE INDEX idx_credentials_student ON credential_records(student_id);
CREATE INDEX idx_credentials_revoked ON credential_records(is_revoked);

CREATE TABLE IF NOT EXISTS verification_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verifier_id TEXT,
    policy JSONB NOT NULL,
    proof_request JSONB,
    status TEXT DEFAULT 'pending' NOT NULL,
    proof_response JSONB,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_verify_sessions_status ON verification_sessions(status);

-- Registered credential issuers
CREATE TABLE IF NOT EXISTS issuers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issuer_did TEXT UNIQUE NOT NULL,
    issuer_address TEXT NOT NULL,
    name TEXT NOT NULL,
    country TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    actor TEXT,
    actor_type TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
