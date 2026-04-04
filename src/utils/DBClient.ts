import { MongoClient, Db } from 'mongodb';
import { logger } from '../logger';

class DBClient {
  private static client: MongoClient | null = null;
  private static db: Db | null = null;

  static async init(): Promise<Db> {
    if (!DBClient.client) {
      const MONGODB_URI = process.env.MONGODB_URI;
      const DB_NAME = process.env.MONGODB_NAME;

      if (!MONGODB_URI || !DB_NAME) {
        throw new Error('MONGODB_URI and MONGODB_NAME environment variables are required');
      }

      DBClient.client = new MongoClient(MONGODB_URI);
      await DBClient.client.connect();
      DBClient.db = DBClient.client.db(DB_NAME);
    }
    logger.info('Database connection established');
    return DBClient.db as Db;
  }

  static getDB(): Db {
    if (!DBClient.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return DBClient.db;
  }

  static async close(): Promise<void> {
    if (DBClient.client) {
      await DBClient.client.close();
      DBClient.db = null;
      DBClient.client = null;
    }
    logger.info('Database connection closed');
  }
}

export default DBClient;
