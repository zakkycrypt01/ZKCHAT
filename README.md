# ZKChat Server

An end-to-end encrypted messaging server with Walrus integration and zkSNARK proofs for P2P token marketplace on Sui.

## Features

- End-to-end encryption using AES-256
- Zero-knowledge proofs using zkSNARKs
- Real-time messaging using WebSocket
- Message storage using Walrus
- Integration with Sui blockchain
- Secure key generation and management
- Message commitment and verification

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Circom compiler
- snarkjs

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Compile the zkSNARK circuit:
```bash
npm run compile
```

4. Generate the proving and verification keys:
```bash
npm run setup
```

## Configuration

Create a `.env` file in the root directory with the following variables:
```
PORT=3000
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## API Endpoints

### REST Endpoints

- `POST /api/generate-keys`
  - Generates a new key pair for encryption
  - Returns: `{ publicKey: string, privateKey: string }`

### WebSocket Events

#### Client to Server
- `register`: Register a user with their public key
  - Data: `{ publicKey: string }`
- `send_message`: Send an encrypted message with zkSNARK proof
  - Data: `{ 
      recipientId: string, 
      message: string, 
      encryptedMessage: string,
      publicKey: string,
      privateKey: string 
    }`
- `retrieve_message`: Retrieve and decrypt a message
  - Data: `{ blobId: string, privateKey: string }`

#### Server to Client
- `registered`: Confirmation of successful registration
  - Data: `{ success: boolean }`
- `new_message`: Notification of new message
  - Data: `{ 
      senderId: string, 
      blobId: string, 
      commitment: string,
      timestamp: string 
    }`
- `message_retrieved`: Retrieved and decrypted message
  - Data: `{ message: string, commitment: string }`
- `error`: Error notification
  - Data: `{ message: string }`

## zkSNARK Implementation

The server uses zkSNARKs to provide zero-knowledge proofs for message verification. This allows:

1. Proving message authenticity without revealing the message content
2. Verifying message commitments
3. Ensuring message integrity
4. Protecting privacy while maintaining trust

The zkSNARK circuit (`circuits/message_verification.circom`) implements:
- Message hashing using Poseidon hash
- Public key verification
- Message commitment generation
- Proof generation and verification

## Security Considerations

1. Always keep private keys secure and never share them
2. Use HTTPS in production
3. Implement rate limiting for production use
4. Add authentication for production use
5. Regularly rotate encryption keys
6. Keep zkSNARK proving keys secure
7. Verify all proofs before accepting messages

## Integration with Sui

This server is designed to work with your P2P token marketplace on Sui. The messaging system can be used to:

1. Send encrypted trade offers with zero-knowledge proofs
2. Communicate about token transfers with verified commitments
3. Share encrypted transaction details with proof of authenticity
4. Handle P2P negotiations with privacy guarantees

## License

MIT 