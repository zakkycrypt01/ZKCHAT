declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: (number | string)[]): bigint;
    F: {
      toObject: (x: bigint) => any;
      toString: (x: bigint) => string;
    };
  }>;
} 