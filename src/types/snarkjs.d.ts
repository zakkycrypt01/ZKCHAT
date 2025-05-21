declare module 'snarkjs' {
  export interface Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
  }

  export interface PublicSignals {
    [key: string]: string;
  }

  export interface FullProveResult {
    proof: Proof;
    publicSignals: PublicSignals;
  }

  export interface VerificationKey {
    protocol: string;
    curve: string;
    nPublic: number;
    vk_alpha_1: [string, string, string];
    vk_beta_2: [[string, string], [string, string], [string, string]];
    vk_gamma_2: [[string, string], [string, string], [string, string]];
    vk_delta_2: [[string, string], [string, string], [string, string]];
    vk_alphabeta_12: [[[string, string], [string, string], [string, string]], [[string, string], [string, string], [string, string]]];
    IC: [string, string, string][];
  }

  export const groth16: {
    fullProve: (
      input: any,
      wasmFile: string,
      zkeyFile: string
    ) => Promise<FullProveResult>;
    verify: (
      verificationKey: VerificationKey,
      publicSignals: PublicSignals,
      proof: Proof
    ) => Promise<boolean>;
  };
} 