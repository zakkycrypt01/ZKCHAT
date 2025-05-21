import express from 'express';
import cors from 'cors';
import { EncryptionService } from './services/EncryptionService';
import { WalrusService } from './services/WalrusService';
import { ZKProofService } from './services/ZKProofService';
import { BadRequestError } from './utils/AppError';

const app = express();

// Configure CORS to allow all origins
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Initialize ZKProofService
ZKProofService.initialize().catch(console.error);

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check request received');
  res.json({ status: 'ok' });
});

// Get messages endpoint
app.get('/api/messages', async (req, res) => {
  try {
    console.log('GET /api/messages - Query params:', req.query);
    const { publicKey } = req.query;
    
    if (!publicKey) {
      console.log('Missing publicKey parameter');
      return res.status(400).json({ 
        error: 'Public key is required',
        message: 'Please provide a publicKey query parameter'
      });
    }

    // Get messages from Walrus service
    const messages = await WalrusService.getMessages(publicKey as string);
    console.log(`Retrieved ${messages.length} messages for publicKey: ${publicKey}`);
    res.json(messages);
  } catch (error) {
    console.error('Error in GET /api/messages:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve messages',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Generate key pair endpoint
app.post('/api/generate-keys', async (req, res) => {
  try {
    console.log('POST /api/generate-keys - Request body:', req.body);
    const keyPair = await EncryptionService.generateKeyPair();
    console.log('Generated key pair:', keyPair);
    res.json(keyPair);
  } catch (error) {
    console.error('Error in POST /api/generate-keys:', error);
    res.status(500).json({ error: 'Failed to generate key pair' });
  }
});

// Send message endpoint (legacy endpoint)
app.post('/api/messages', async (req, res) => {
  try {
    console.log('POST /api/messages - Request body:', req.body);
    const { orderId, sender, recipient, message, timestamp } = req.body;

    if (!orderId || !sender || !recipient || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'orderId, sender, recipient, and message are required'
      });
    }

    // Generate ephemeral key pair for this message
    const ephemeralKeyPair = await EncryptionService.generateKeyPair();
    console.log('Generated ephemeral key pair for message');

    // Generate zkSNARK proof using ephemeral keys
    const { proof, publicSignals, commitment } = await ZKProofService.generateProof(
      message,
      sender,
      ephemeralKeyPair.privateKey
    );

    // Encrypt the message
    const encryptedMessage = EncryptionService.encryptMessage(
      message,
      ephemeralKeyPair.privateKey
    );

    // Store the encrypted message and proof in Walrus
    const messageData = {
      orderId,
      sender,
      recipient,
      encryptedMessage,
      proof,
      publicSignals,
      commitment,
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      ephemeralPrivateKey: ephemeralKeyPair.privateKey,
      timestamp: timestamp || Math.floor(Date.now() / 1000)
    };

    console.log('Storing message data:', messageData);
    const blobId = await WalrusService.storeMessage(JSON.stringify(messageData));
    
    const response = {
      id: blobId,
      orderId,
      sender,
      recipient,
      message, // Return original message to sender
      proof,
      publicSignals,
      commitment,
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      timestamp: messageData.timestamp,
      status: 'sent',
      blobId
    };
    console.log('Sending response:', response);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error in POST /api/messages:', error);
    res.status(500).json({ 
      error: 'Failed to send message',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Retrieve message endpoint
app.post('/api/messages/retrieve', async (req, res) => {
  try {
    console.log('POST /api/messages/retrieve - Request body:', req.body);
    const { blobId, privateKey, publicKey } = req.body;
    
    const messageData = JSON.parse(await WalrusService.retrieveMessage(blobId));
    console.log('Retrieved message data:', messageData);
    
    // Verify the zkSNARK proof
    const isValid = await ZKProofService.verifyProof(
      messageData.proof,
      messageData.publicSignals
    );

    if (!isValid) {
      console.log('Invalid proof');
      throw new Error('Invalid proof');
    }

    // Verify message commitment
    const isMessageValid = await ZKProofService.verifyMessage(
      messageData.encryptedMessage,
      publicKey,
      messageData.commitment,
      messageData.timestamp
    );

    if (!isMessageValid) {
      console.log('Invalid message commitment');
      throw new Error('Invalid message commitment');
    }

    const decryptedMessage = EncryptionService.decryptMessage(
      messageData.encryptedMessage,
      privateKey
    );

    const response = { 
      message: decryptedMessage,
      commitment: messageData.commitment,
      timestamp: messageData.timestamp
    };
    console.log('Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error in POST /api/messages/retrieve:', error);
    res.status(500).json({ error: 'Failed to retrieve message' });
  }
});

const PORT = process.env.PORT || 2001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 