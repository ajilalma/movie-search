dotenv = require('dotenv');
dotenv.config();

const DBClient = require('./utils/DBClient');
const LLMClient = require('./utils/LLMClient');

Promise.all([
    DBClient.init(),
    LLMClient.init()
]).then((dbClient, llmClient) => {
    console.log("Database initialized");
    console.log("LLM Client initialized");
    const testStr = "Hello, world!";
    LLMClient.generateVector(testStr).then((vector) => {
        console.log("Generated vector:", vector);
    });
}).catch((error) => {
    console.error("Error initializing database:", error);
}).finally(() => {
    DBClient.close();
});