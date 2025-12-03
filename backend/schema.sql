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

-- Users
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
    revocation_nonce BIGINT NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    revocation_reason TEXT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    issued_by TEXT,
    status VARCHAR(20) DEFAULT 'issued',
    offered_at TIMESTAMP WITH TIME ZONE,
    fetched_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    FOREIGN KEY (student_id) REFERENCES users(student_id)
);

CREATE INDEX idx_credentials_holder ON credential_records(holder_did);
CREATE INDEX idx_credentials_student ON credential_records(student_id);

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

-- Sample users
INSERT INTO users (student_id, name, email, password_hash, role)
VALUES
    ('STU001', 'John Smith', 'john.smith@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'), -- Password: Password123!
    ('STU002', 'Emily Johnson', 'emily.johnson@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU003', 'Michael Davis', 'michael.davis@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU004', 'Sarah Williams', 'sarah.williams@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU005', 'James Brown', 'james.brown@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU006', 'Jennifer Garcia', 'jennifer.garcia@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU007', 'David Martinez', 'david.martinez@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU008', 'Lisa Rodriguez', 'lisa.rodriguez@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU009', 'Robert Lee', 'robert.lee@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('STU010', 'Maria Hernandez', 'maria.hernandez@asu.edu', '$2b$10$fS84EYZ7bQGC2IlghjZuHO6lPZBwMrPridsWqpnAoFNhHDAZ.LPxK', 'student'),
    ('EMP001', 'TechCorp HR', 'hr@techcorp.com', '$2b$10$4fSYrDFbIx8.IM3r1QANP.KMZonWKJtlgtaJ7BZrBxJg3wfTvERuW', 'employer'), -- Password: Employer123!
    ('EMP002', 'Global Solutions', 'recruiter@globalsolutions.com', '$2b$10$4fSYrDFbIx8.IM3r1QANP.KMZonWKJtlgtaJ7BZrBxJg3wfTvERuW', 'employer')
ON CONFLICT (student_id) DO NOTHING;

GRANT ALL ON TABLE sessions TO service_role;
GRANT ALL ON TABLE verification_sessions TO service_role;
GRANT ALL ON TABLE users TO service_role;
GRANT ALL ON TABLE did_bindings TO service_role;
GRANT ALL ON TABLE credential_records TO service_role;
GRANT ALL ON TABLE audit_logs TO service_role;