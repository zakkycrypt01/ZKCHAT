import CryptoJS from 'crypto-js';
import { buildPoseidon } from 'circomlibjs';

export class EncryptionService {
  private static readonly KEY_SIZE = 256;
  private static readonly ITERATIONS = 1000;
  private static poseidon: any = null;

  private static async initialize() {
    if (!this.poseidon) {
      this.poseidon = await buildPoseidon();
    }
  }

  private static hexToBigInt(hex: string): bigint {
    // Remove '0x' prefix if present
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    // Ensure the hex string is not empty
    if (!cleanHex) return BigInt(0);
    return BigInt('0x' + cleanHex);
  }

  private static poseidonHashToBigInt(hash: any): bigint {
    try {
      // Convert Poseidon hash output to a single BigInt
      if (hash instanceof Uint8Array) {
        // Convert Uint8Array to BigInt by treating it as a big-endian number
        let result = BigInt(0);
        for (let i = 0; i < hash.length; i++) {
          result = (result << BigInt(8)) | BigInt(hash[i]);
        }
        return result;
      } else if (Array.isArray(hash)) {
        // Convert array of numbers to BigInt
        let result = BigInt(0);
        for (let i = 0; i < hash.length; i++) {
          result = (result << BigInt(8)) | BigInt(hash[i]);
        }
        return result;
      } else if (typeof hash === 'object' && hash.values && Array.isArray(hash.values)) {
        // Handle case where hash might be a specialized object with values array
        let result = BigInt(0);
        for (let i = 0; i < hash.values.length; i++) {
          result = (result << BigInt(8)) | BigInt(hash.values[i]);
        }
        return result;
      } else {
        // For non-array values, try direct conversion
        return BigInt(hash.toString());
      }
    } catch (error) {
      console.error('Error converting hash to BigInt:', {
        hash,
        hashType: hash instanceof Uint8Array ? 'Uint8Array' :
                  Array.isArray(hash) ? 'array' : 
                  (typeof hash === 'object' && hash.values) ? 'object-with-values' : 
                  typeof hash,
        error
      });
      throw error;
    }
  }

  static async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    await this.initialize();
    
    // Generate private key
    const privateKey = CryptoJS.lib.WordArray.random(32).toString();
    const privateKeyNum = this.hexToBigInt(privateKey);

    // Derive public key using Poseidon(1)
    const publicKeyHash = this.poseidon([privateKeyNum]);
    const publicKeyNum = this.poseidonHashToBigInt(publicKeyHash);
    const publicKey = '0x' + publicKeyNum.toString(16);

    return { publicKey, privateKey };
  }

  static async generateMessageHash(message: string): Promise<bigint> {
    await this.initialize();
    const messageNum = this.hexToBigInt(CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(message)));
    const messageHash = this.poseidon([messageNum]);
    return this.poseidonHashToBigInt(messageHash);
  }

  static encryptMessage(message: string, publicKey: string): string {
    const salt = CryptoJS.lib.WordArray.random(128 / 8);
    const key = CryptoJS.PBKDF2(publicKey, salt, {
      keySize: this.KEY_SIZE / 32,
      iterations: this.ITERATIONS
    });

    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    const encrypted = CryptoJS.AES.encrypt(message, key, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });

    const result = {
      salt: salt.toString(),
      iv: iv.toString(),
      encrypted: encrypted.toString()
    };

    return JSON.stringify(result);
  }

  static decryptMessage(encryptedData: string, privateKey: string): string {
    const data = JSON.parse(encryptedData);
    const salt = CryptoJS.enc.Hex.parse(data.salt);
    const iv = CryptoJS.enc.Hex.parse(data.iv);

    const key = CryptoJS.PBKDF2(privateKey, salt, {
      keySize: this.KEY_SIZE / 32,
      iterations: this.ITERATIONS
    });

    const decrypted = CryptoJS.AES.decrypt(data.encrypted, key, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  }
}