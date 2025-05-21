import axios from 'axios';
import dotenv from 'dotenv';
import { InternalServerError } from '../utils/AppError';
import { Message } from './MessageService';
import mongoose, { Document, Types } from 'mongoose';
import { EncryptionService } from './EncryptionService';
dotenv.config();

interface IMessage extends Document {
  orderId: string;
  sender: string;
  recipient: string;
  blobId: string;
  timestamp: number;
  createdAt: Date;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  _id: Types.ObjectId;
  ephemeralPrivateKey: string;
}

const MessageSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  sender: { type: String, required: true, index: true },
  recipient: { type: String, required: true, index: true },
  blobId: { type: String, required: true },
  timestamp: { type: Number, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  ephemeralPrivateKey: { type: String, required: true }
});

const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);

export class WalrusService {
  private static readonly WALRUS_PUBLISHER_URL = 'https://walrus-publisher-testnet.n1stake.com/v1/blobs';
  private static readonly WALRUS_AGGREGATOR_URL = 'https://aggregator.walrus-testnet.walrus.space/v1/blobs/';
  private static isInitialized = false;
  private static isMongoAvailable = false;

  static async initialize() {
    if (this.isInitialized) return;

    try {
      const MONGODB_URI = process.env.MONGODB_URI;
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in the environment variables');
      }
      console.log('Connecting to MongoDB...');
      
      const options = {
        serverSelectionTimeoutMS: 5000, 
        socketTimeoutMS: 45000,
      };

      await mongoose.connect(MONGODB_URI, options);
      console.log('Connected to MongoDB successfully');
      this.isMongoAvailable = true;
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      console.log('Continuing without MongoDB - messages will not be persisted');
      this.isMongoAvailable = false;
      this.isInitialized = true;
    }
  }

  static async storeMessage(message: string): Promise<string> {
    try {
      console.log('Storing message in Walrus:', message);
      const response = await axios.put(
        this.WALRUS_PUBLISHER_URL,
        { message },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('Walrus store response:', response.data);
      
      const blobId = response.data.newlyCreated.blobObject.blobId;
      
      const messageData = JSON.parse(message);
      
      await this.initialize();
      if (this.isMongoAvailable) {
        await MessageModel.create({
          orderId: messageData.orderId,
          sender: messageData.sender,
          recipient: messageData.recipient,
          blobId: blobId,
          timestamp: messageData.timestamp,
          status: 'sent',
          ephemeralPrivateKey: messageData.ephemeralPrivateKey
        });
        console.log('Message reference stored in MongoDB');
      }
      
      return blobId;
    } catch (error) {
      console.error('Error storing message in Walrus:', error);
      throw new InternalServerError('Failed to store message in Walrus', { error });
    }
  }

  static async retrieveMessage(blobId: string): Promise<string> {
    try {
      console.log('Retrieving message from Walrus:', blobId);
      const response = await axios.get(
        `${this.WALRUS_AGGREGATOR_URL}${blobId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('Walrus retrieve response:', response.data);
      return response.data.message;
    } catch (error) {
      console.error('Error retrieving message from Walrus:', error);
      throw new InternalServerError('Failed to retrieve message from Walrus', { error });
    }
  }

  static async getMessages(userId: string, orderIdPrefix?: string): Promise<Message[]> {
    try {
      await this.initialize();
      console.log('Getting messages for user:', userId);

      if (!this.isMongoAvailable) {
        console.log('MongoDB not available - returning empty message list');
        return [];
      }

      const query: any = {
        $or: [{ sender: userId }, { recipient: userId }]
      };

      // Add filter for orderId prefix if provided
      if (orderIdPrefix) {
        query.orderId = { $regex: `^${orderIdPrefix}` }; // Matches orderId starting with the prefix
      }

      const messages = await MessageModel.find(query).sort({ timestamp: -1 });
      console.log('Found messages in MongoDB:', messages);

      const messagePromises = messages.map(async (msg: IMessage) => {
        try {
          const rawMessage = await this.retrieveMessage(msg.blobId);
          console.log('Raw message from Walrus:', rawMessage);

          const messageData = JSON.parse(rawMessage);
          console.log('Parsed message data:', messageData);

          const encryptedMessage = typeof messageData.encryptedMessage === 'string'
            ? JSON.parse(messageData.encryptedMessage)
            : messageData.encryptedMessage;

          console.log('Parsed encrypted message:', encryptedMessage);

          const ephemeralPrivateKey = msg.ephemeralPrivateKey;
          if (!ephemeralPrivateKey) {
            console.error('No ephemeral private key found for message:', msg.blobId);
            return null;
          }

          const decryptedMessage = EncryptionService.decryptMessage(
            JSON.stringify(encryptedMessage),
            ephemeralPrivateKey
          );
          console.log('Decrypted message:', decryptedMessage);

          const finalMessage = {
            id: msg._id.toString(),
            orderId: msg.orderId,
            sender: msg.sender,
            recipient: msg.recipient,
            message: decryptedMessage,
            proof: messageData.proof,
            publicSignals: messageData.publicSignals,
            commitment: messageData.commitment,
            timestamp: msg.timestamp,
            ephemeralPublicKey: messageData.ephemeralPublicKey,
            status: msg.status,
            blobId: msg.blobId
          } as Message;

          console.log('Final message object:', finalMessage);
          return finalMessage;
        } catch (error) {
          console.error(`Error retrieving message ${msg.blobId}:`, error);
          return null;
        }
      });

      const retrievedMessages = (await Promise.all(messagePromises)).filter((msg): msg is Message => msg !== null);
      console.log('Retrieved messages from Walrus:', retrievedMessages);
      return retrievedMessages;
    } catch (error) {
      console.error('Error getting messages:', error);
      throw new InternalServerError('Failed to retrieve messages', { error });
    }
  }

  static async storeMessageReference(message: Message): Promise<void> {
    try {
      await this.initialize();
      
      if (!this.isMongoAvailable) {
        console.log('MongoDB not available - skipping message reference storage');
        return;
      }

      console.log('Storing message reference:', message);
      await MessageModel.create({
        orderId: message.orderId,
        sender: message.sender,
        recipient: message.recipient,
        blobId: message.blobId || message.id,
        timestamp: message.timestamp,
        status: message.status
      });
    } catch (error) {
      console.error('Error storing message reference:', error);
      throw new InternalServerError('Failed to store message reference', { error });
    }
  }

  static async updateMessageStatus(messageId: string, status: Message['status']): Promise<void> {
    try {
      await this.initialize();
      
      if (!this.isMongoAvailable) {
        console.log('MongoDB not available - skipping status update');
        return;
      }

      console.log('Updating message status:', { messageId, status });
      await MessageModel.findByIdAndUpdate(messageId, { status });
    } catch (error) {
      console.error('Error updating message status:', error);
      throw new InternalServerError('Failed to update message status', { error });
    }
  }

  async notifyNewMessage(message: Message): Promise<void> {
    try {
      console.log('Notifying about new message:', message.id);
      await WalrusService.storeMessageReference(message);
    } catch (error) {
      console.error('Error notifying about new message:', error);
      throw new InternalServerError('Failed to notify about new message', { error });
    }
  }
}