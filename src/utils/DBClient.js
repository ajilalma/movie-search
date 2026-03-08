const { MongoClient } = require("mongodb");

class DBClient {
    static client;
    static db;

    static async init() {
        if (!DBClient.client) {
            // Config via env or CLI args
            const MONGODB_URI = process.env.MONGODB_URI;
            const DB_NAME = process.env.MONGODB_NAME;
            DBClient.client = new MongoClient(MONGODB_URI);
            await DBClient.client.connect();
            DBClient.db = DBClient.client.db(DB_NAME);
        }
        return DBClient.db;
    }

    static getDB() {
        return DBClient.db;
    }

    static async close() {
        await DBClient.client.close();
        DBClient.db = null;
    }
}

module.exports = DBClient;
