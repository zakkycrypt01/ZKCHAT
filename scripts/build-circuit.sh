#!/bin/bash

# Create necessary directories
mkdir -p circuits/build
mkdir -p circuits/keys

# Compile the circuit with proper include paths
circom circuits/message_verification.circom --r1cs --wasm --sym -o circuits/build -l node_modules/circomlib/circuits

# Generate the zkey
snarkjs groth16 setup circuits/build/message_verification.r1cs circuits/powersoftau/powersoftau_final.ptau circuits/keys/message_verification_0000.zkey

# Contribute to the phase 2 ceremony
snarkjs zkey contribute circuits/keys/message_verification_0000.zkey circuits/keys/message_verification_0001.zkey --name="First contribution" -v

# Export the verification key
snarkjs zkey export verificationkey circuits/keys/message_verification_0001.zkey circuits/keys/verification_key.json

# Export the solidity verifier
snarkjs zkey export solidityverifier circuits/keys/message_verification_0001.zkey contracts/MessageVerifier.sol

echo "Circuit build completed successfully!"

# Exit successfully
exit 0