import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', JSON.stringify(err));
  const status = (err as any).status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  console.log(`Path: ${req.path}`);
  console.log(`Query:`, req.query);
  if (req.method === 'POST' || req.method === 'PUT') {
    if (typeof req.body === 'string') {
      console.log(`Body (first 200 chars): ${req.body.substring(0, 200)}...`);
    } else {
      console.log(`Body:`, JSON.stringify(req.body, null, 2).substring(0, 500));
    }
  }
  res.on('finish', () => {
    console.log(`Response: ${JSON.stringify(res.statusCode)}`);
  });
  next();
}
