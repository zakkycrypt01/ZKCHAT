import { groth16, Proof, PublicSignals, FullProveResult } from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import { InternalServerError } from '../utils/AppError';
import { EncryptionService } from '../services/EncryptionService';

export interface ProofData {
  proof: Proof;
  publicSignals: PublicSignals;
  commitment: string;
}

export class ZKProofService {
  private static poseidon: any = null;

  static async initialize() {
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

  private static stringToBigInt(str: string): bigint {
    // Convert string to a simple numeric representation
    // This matches how the circuit processes the message
    let result = BigInt(0);
    for (let i = 0; i < str.length; i++) {
      // Convert each character to its ASCII code and add to result
      result = result * BigInt(256) + BigInt(str.charCodeAt(i));
    }
    // Ensure the result is within the field size
    const fieldSize = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    return result % fieldSize;
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

  static async generateProof(
    message: string,
    publicKey: string,
    privateKey: string
  ): Promise<ProofData> {
    try {
      await this.initialize();

      // Convert inputs to BigInt
      const messageNum = this.stringToBigInt(message);
      const publicKeyNum = this.hexToBigInt(publicKey);

      // Ensure privateKey is a valid BigInt
      const privateKeyNum = privateKey.startsWith('0x')
        ? BigInt(privateKey)
        : BigInt('0x' + privateKey);

      // Get current timestamp in seconds
      const currentTime = Math.floor(Date.now() / 1000);

      // Compute the message hash using Poseidon
      const messageHash = this.poseidon([messageNum]);
      const messageHashNum = this.poseidonHashToBigInt(messageHash);

      console.log('=== Debugging Message Hash ===');
      console.log('Raw message:', message);
      console.log('Message as BigInt:', messageNum.toString());
      console.log('Computed message hash:', messageHashNum.toString());

      // Create the witness with properly formatted inputs
      const input = {
        message: messageNum.toString(),
        publicKey: publicKeyNum.toString(),
        privateKey: privateKeyNum.toString(),
        messageHash: messageHashNum.toString(),
        timestamp: currentTime.toString()
      };

      console.log('\n=== Circuit Input ===');
      console.log(JSON.stringify(input, null, 2));

      // Generate the proof
      const { proof, publicSignals } = await groth16.fullProve(
        input,
        'circuits/build/message_verification_js/message_verification.wasm',
        'circuits/keys/message_verification_0001.zkey'
      );

      // Compute the commitment
      const commitmentHash = this.poseidon([messageNum, publicKeyNum, currentTime]);
      const commitment = this.poseidonHashToBigInt(commitmentHash).toString();

      return { proof, publicSignals, commitment };
    } catch (error) {
      console.error('Error in generateProof:', error);
      throw new InternalServerError('Failed to generate zkSNARK proof', { error });
    }
  }

  private static async getVerificationKey() {
    return require('../circuits/keys/verification_key.json');
  }

  static async verifyProof(
    proof: Proof,
    publicSignals: PublicSignals,
    ephemeralPublicKey?: string
  ): Promise<boolean> {
    try {
      // Verify the proof using the ephemeral public key if provided
      const verificationKey = await this.getVerificationKey();
      const isValid = await groth16.verify(
        verificationKey,
        publicSignals,
        proof
      );

      // Additional verification using ephemeral public key if provided
      if (ephemeralPublicKey) {
        // Add any additional verification logic here
        // For example, verify that the ephemeral public key matches the one used in the proof
      }

      return isValid;
    } catch (error) {
      console.error('Error verifying proof:', error);
      throw new InternalServerError('Failed to verify proof', { error });
    }
  }

  static async verifyMessage(
    message: string,
    publicKey: string,
    commitment: string,
    timestamp: number
  ): Promise<boolean> {
    try {
      await this.initialize();
      
      // Verify timestamp is not too old
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime - timestamp > 86400) { // 24 hours
        return false;
      }

      // Convert inputs to BigInt
      const messageNum = this.stringToBigInt(message);
      const publicKeyNum = this.hexToBigInt(publicKey);

      // Verify commitment
      const commitmentHash = this.poseidon([messageNum, publicKeyNum, timestamp]);
      const expectedCommitment = this.poseidonHashToBigInt(commitmentHash).toString();
      return expectedCommitment === commitment;
    } catch (error) {
      console.error('Error in verifyMessage:', error);
      throw new InternalServerError('Failed to verify message', { error });
    }
  }

  static async generateMessageCommitment(
    message: string,
    publicKey: string
  ): Promise<string> {
    await this.initialize();
    
    // Convert inputs to BigInt
    const messageNum = this.stringToBigInt(message);
    const publicKeyNum = this.hexToBigInt(publicKey);

    const commitmentHash = this.poseidon([messageNum, publicKeyNum]);
    return this.poseidonHashToBigInt(commitmentHash).toString();
  }
}