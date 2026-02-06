import crypto from 'crypto';

// Use environment variable for encryption key, or warn if not set
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: ENCRYPTION_KEY environment variable not set. Credentials will not be encrypted!');
}

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    // Development fallback - NOT SECURE
    console.warn('Using fallback encryption key for development. Set ENCRYPTION_KEY in production!');
    return Buffer.from('dev-key-32-bytes-long-for-testing-only!'.padEnd(32, '0'), 'utf8').slice(0, 32);
  }
  return Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
}

export function encryptCredentials(credentials: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(credentials, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted,
      tag: authTag.toString('hex'),
      version: 1,
    });
  } catch (err) {
    console.error("Encryption error:", err);
    throw new Error("Failed to encrypt credentials");
  }
}

export function decryptCredentials(encrypted: string): string {
  try {
    const parsed = JSON.parse(encrypted);
    const { iv, data, tag, version } = parsed;
    
    if (!iv || !data || !tag) {
      throw new Error("Invalid encrypted data format");
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error("Decryption error:", err);
    throw new Error("Failed to decrypt credentials");
  }
}
