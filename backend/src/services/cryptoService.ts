import crypto from 'crypto';
import { CONFIG } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length is 12 bytes
const TAG_LENGTH = 16; // GCM auth tag length is 16 bytes

export class CryptoService {
  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a payload in the format "v1:iv_hex:auth_tag_hex:ciphertext_hex"
   */
  public static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, CONFIG.ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM payload in the format "v1:iv_hex:auth_tag_hex:ciphertext_hex".
   */
  public static decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted payload format');
    }

    const [version, ivHex, tagHex, ciphertextHex] = parts;
    if (version !== 'v1') {
      throw new Error(`Unsupported encryption version: ${version}`);
    }

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, CONFIG.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
