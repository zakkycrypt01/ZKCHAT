import { Request, Response, NextFunction } from 'express';
import { InternalServerError } from '../utils/AppError';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);
  
  if (err instanceof InternalServerError) {
    return res.status(500).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
}; 