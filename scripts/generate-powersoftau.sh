#!/bin/bash

# Create necessary directories
mkdir -p circuits/powersoftau

# Generate the initial powers of tau ceremony file
snarkjs powersoftau new bn128 16 circuits/powersoftau/powersoftau_0000.ptau -v

# Contribute to the ceremony
snarkjs powersoftau contribute circuits/powersoftau/powersoftau_0000.ptau circuits/powersoftau/powersoftau_0001.ptau --name="First contribution" -e="docker-build-entropy" -v

# Add a random beacon
snarkjs powersoftau beacon circuits/powersoftau/powersoftau_0001.ptau circuits/powersoftau/powersoftau_final.ptau 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon"

# Prepare phase 2
snarkjs powersoftau prepare phase2 circuits/powersoftau/powersoftau_final.ptau circuits/powersoftau/powersoftau_final.ptau -v

echo "Powers of tau ceremony completed successfully!" 

exit 0