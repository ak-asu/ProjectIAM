import { randomBytes, createHash, randomUUID } from 'crypto';

export function generateNonce(length = 32) {
  return randomBytes(length).toString('hex');
}

export function generateId() {
  return randomUUID(); // UUID v4 format for PostgreSQL compatibility
}

export function sha256(data: string) {
  return createHash('sha256').update(data).digest('hex');
}

export function generatePortalToken() {
  return randomBytes(32).toString('hex');
}

export function extractDIDMethod(did: string) {
  const parts = did.split(':');
  return parts.length >= 2 ? parts[1] : null;
}

export function extractDIDIdentifier(did: string) {
  const parts = did.split(':');
  return parts.length >= 3 ? parts.slice(2).join(':') : null;
}

export function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function getFutureTimestamp(minsFromNow: number) {
  return getCurrentTimestamp() + minsFromNow * 60;
}

export function isExpired(timestamp: number) {
  return getCurrentTimestamp() > timestamp;
}

export function dateToTimestamp(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function timestampToDate(timestamp: number) {
  return new Date(timestamp * 1000);
}
