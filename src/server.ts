import express from 'express';
import { config } from 'dotenv';
import { MessageService } from './services/MessageService';
import { ZKProofService, ProofData } from './services/ZKProofService';
import { WalrusService } from './services/WalrusService';
import { errorHandler } from './middleware/errorHandler';
import { validateMessage } from './middleware/validateMessage';
import { InternalServerError } from './utils/AppError';
import { Proof, PublicSignals } from 'snarkjs';
import { EncryptionService } from './services/EncryptionService';

config();

const app = express();
app.use(express.json());

// Initialize services
const messageService = new MessageService();
const walrusService = new WalrusService();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Messages endpoint
app.get('/api/messages', async (req, res, next) => {
  try {
    const { user: userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const messages = await messageService.getMessages(userId as string);
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

// Message endpoints
app.post('/api/messages', validateMessage, async (req, res, next) => {
  try {
    const { orderId, sender, recipient, message } = req.body;

    if (!orderId || !sender || !recipient || !message) {
      return res.status(400).json({ 
        error: 'Order ID, sender, recipient, and message are required' 
      });
    }

    // Generate ephemeral key pair for this message
    const ephemeralKeyPair = EncryptionService.generateKeyPair();
    console.log('Generated ephemeral key pair for message');

    // Generate zkSNARK proof using ephemeral keys
    const proofData: ProofData = await ZKProofService.generateProof(
      message,
      sender,
      ephemeralKeyPair.privateKey
    );

    // Encrypt the message
    const encryptedMessage = EncryptionService.encryptMessage(
      message,
      ephemeralKeyPair.privateKey
    );

    // Store message with proof and encryption
    const storedMessage = await messageService.storeMessage({
      orderId,
      sender,
      recipient,
      message: encryptedMessage,
      proof: JSON.stringify(proofData.proof),
      publicSignals: Object.values(proofData.publicSignals),
      commitment: proofData.commitment,
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      status: 'sending'
    });

    // Notify Walrus service
    await walrusService.notifyNewMessage(storedMessage);

    // Update status to sent after successful storage
    await messageService.updateMessageStatus(storedMessage.id, 'sent');

    // Return decrypted message to sender
    res.status(201).json({
      ...storedMessage,
      message // Return original message to sender
    });
  } catch (error) {
    next(error);
  }
});

// Update message status endpoint
app.patch('/api/messages/:messageId/status', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'sent', 'delivered', 'read', 'failed'].includes(status)) {
      return res.status(400).json({ 
        error: 'Valid status is required' 
      });
    }

    const updatedMessage = await messageService.updateMessageStatus(messageId, status);
    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update status in Walrus service if available
    try {
      await WalrusService.updateMessageStatus(messageId, status);
    } catch (error) {
      console.error('Failed to update status in Walrus:', error);
      // Continue even if Walrus update fails
    }

    res.json(updatedMessage);
  } catch (error) {
    next(error);
  }
});

// Proof verification endpoint
app.post('/api/verify', async (req, res, next) => {
  try {
    const { proof, publicSignals, ephemeralPublicKey } = req.body;
    const proofObj = JSON.parse(proof) as Proof;
    const publicSignalsObj = Object.fromEntries(
      publicSignals.map((signal: string, index: number) => [index.toString(), signal])
    ) as PublicSignals;
    const isValid = await ZKProofService.verifyProof(proofObj, publicSignalsObj, ephemeralPublicKey);
    res.json({ verified: isValid });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 2001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 