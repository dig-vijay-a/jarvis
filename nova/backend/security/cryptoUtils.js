import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keyFilePath = path.resolve(__dirname, '../../../data/.master.key');

/**
 * Retrieves or initializes the persistent 32-byte master key for AES-256-GCM.
 * Never hardcodes secrets in application source files.
 */
export function getMasterKey() {
  if (process.env.NOVA_MASTER_SECRET && process.env.NOVA_MASTER_SECRET.length >= 32) {
    return crypto.createHash('sha256').update(process.env.NOVA_MASTER_SECRET).digest();
  }

  // Ensure data directory exists
  const dataDir = path.dirname(keyFilePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(keyFilePath)) {
    try {
      const stored = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (stored.length === 64) {
        return Buffer.from(stored, 'hex');
      }
    } catch (err) {
      console.warn('[CryptoUtils] Failed reading keyfile, generating new key:', err.message);
    }
  }

  // Generate strong 32-byte random key and persist locally
  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFilePath, newKey.toString('hex'), { mode: 0o600 });
  } catch (err) {
    console.warn('[CryptoUtils] Could not restrict key permissions:', err.message);
  }
  return newKey;
}

/**
 * Encrypts plain text into an AES-256-GCM ciphertext bundle:
 * Format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptData(plainText) {
  if (plainText === null || plainText === undefined) return null;
  const textStr = typeof plainText === 'string' ? plainText : JSON.stringify(plainText);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const key = getMasterKey();

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(textStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext bundle.
 */
export function decryptData(encryptedBundle) {
  if (!encryptedBundle || typeof encryptedBundle !== 'string') return null;
  const parts = encryptedBundle.split(':');
  if (parts.length !== 3) {
    // Return raw if it wasn't encrypted (backward compatibility with legacy records)
    return encryptedBundle;
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  try {
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[CryptoUtils] Decryption failure or tampering detected:', err.message);
    throw new Error('Integrity check failed: unable to decrypt payload');
  }
}

/**
 * Hashes a secret PIN or password using PBKDF2-SHA512 with a salt.
 */
export function hashPin(pin, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const keyLength = 64; // 512 bits
  const digest = 'sha512';

  const derived = crypto.pbkdf2Sync(pin.toString(), salt, iterations, keyLength, digest).toString('hex');
  return { hash: derived, salt, iterations };
}

/**
 * Constant-time verification of PIN against stored hash and salt.
 */
export function verifyPin(inputPin, storedHash, storedSalt) {
  if (!inputPin || !storedHash || !storedSalt) return false;
  const { hash } = hashPin(inputPin, storedSalt);
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates an opaque cryptographically secure random session token.
 */
export function generateSecureToken(prefix = 'nova-sec') {
  const bytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}-${bytes}`;
}

/**
 * SHA-256 hashing for idempotency keys or checksums.
 */
export function sha256(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex');
}

export default {
  getMasterKey,
  encryptData,
  decryptData,
  hashPin,
  verifyPin,
  generateSecureToken,
  sha256
};
