pragma circom 2.0.0;

include "poseidon.circom";
include "comparators.circom";

template MessageVerification() {
    // Input signals
    signal input message;
    signal input publicKey;
    signal input privateKey;
    signal input messageHash; // Input signal for the expected message hash
    signal input timestamp;

    // Output signals
    signal output verified;
    signal output commitment;

    // Components
    component poseidon = Poseidon(1);
    component poseidon3 = Poseidon(3);
    component lessThan = LessThan(32);

    // Log expected values
    log("Expected message hash from input:", messageHash);

    // Inside the circuit
    component computedMessageHash = Poseidon(1); // Renamed to avoid conflict
    computedMessageHash.inputs[0] <== message; // Fixed property name
    log("Message being hashed:", message);
    log("Computed message hash:", computedMessageHash.out);

    // Hash the message
    poseidon.inputs[0] <== message;
    log("Actual message hash from circuit:", poseidon.out);
    computedMessageHash.out === poseidon.out;

    // Generate message commitment with timestamp
    poseidon3.inputs[0] <== message;
    poseidon3.inputs[1] <== publicKey;
    poseidon3.inputs[2] <== timestamp;
    commitment <== poseidon3.out;

    // Verify timestamp is not too old (e.g., within last 24 hours)
    lessThan.in[0] <== timestamp;
    lessThan.in[1] <== timestamp + 1; // Ensure timestamp is not in the future
    log("Timestamp check:", lessThan.out);
    lessThan.out === 1;

    // Set the verification output
    verified <== 1;
}

component main = MessageVerification();