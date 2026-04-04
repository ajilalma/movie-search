import dotenv from 'dotenv';

dotenv.config();

import { ChatService } from './service/ChatService';
import DBClient from './utils/DBClient';
import LLMClient from './utils/LLMClient';
import { chatInitialContext, contextWindowCharLength } from './consts/appconsts';
import { logger } from './logger';

async function main(): Promise<void> {
  try {
    await Promise.all([DBClient.init(), LLMClient.init()]);
    const chatService = new ChatService(chatInitialContext, contextWindowCharLength);
    await chatService.startChat();
  } catch (error) {
    logger.error('Error initializing services:', error);
    process.exit(1);
  } finally {
    await DBClient.close();
  }
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
