import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config/config';
import logger from './utils/logger';
import ttsRoutes from './routes/ttsRoutes';

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/static/audio', express.static(path.join(__dirname, '../finish')));

// Routes
app.use('/api/tts', ttsRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
}); 