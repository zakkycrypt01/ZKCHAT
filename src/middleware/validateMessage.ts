import { Request, Response, NextFunction } from 'express';
import { InternalServerError } from '../utils/AppError';

export const validateMessage = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { message, publicKey, privateKey } = req.body;

  if (!message || !publicKey || !privateKey) {
    throw new InternalServerError('Missing required fields: message, publicKey, or privateKey');
  }

  next();
}; 