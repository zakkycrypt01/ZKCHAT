import { Proof, PublicSignals } from 'snarkjs';
import { InternalServerError } from '../utils/AppError';

export interface Message {
  id: string;
  orderId: string;
  sender: string;
  recipient: string;
  message: string;
  proof: string;
  publicSignals: string[];
  commitment: string;
  timestamp: number;
  ephemeralPublicKey?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' ;
  blobId?: string;
}

export class MessageService {
  private messages: Map<string, Message[]> = new Map();

  async storeMessage(messageData: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    try {
      const message: Message = {
        ...messageData,
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        status: 'sending'
      };

      // Store message for both sender and recipient
      const senderMessages = this.messages.get(message.sender) || [];
      senderMessages.push(message);
      this.messages.set(message.sender, senderMessages);

      const recipientMessages = this.messages.get(message.recipient) || [];
      recipientMessages.push(message);
      this.messages.set(message.recipient, recipientMessages);

      return message;
    } catch (error) {
      throw new InternalServerError('Failed to store message', { error });
    }
  }

  async getMessages(userId: string): Promise<Message[]> {
    try {
      return this.messages.get(userId) || [];
    } catch (error) {
      throw new InternalServerError('Failed to retrieve messages', { error });
    }
  }

  async updateMessageStatus(messageId: string, status: Message['status']): Promise<Message | null> {
    const senderMessages = this.messages.get(messageId.split(':')[0]) || [];
    const message = senderMessages.find(msg => msg.id === messageId);
    if (message) {
      message.status = status;
      return message;
    }
    return null;
  }
} 