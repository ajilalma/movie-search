import * as readline from 'readline';
import LLMClient from '../utils/LLMClient';
import { MovieService } from './MovieService';
import { logger } from '../logger';
import { LLMToolOrchestrator } from '../utils/LLMToolOrchestrator';

class ChatService {
  private systemContext: string;
  private contextWindow: number;
  private chatSoFar: string = '';
  private dbQueryOrchestrator: LLMToolOrchestrator;

  constructor(systemContext: string, contextWindow: number) {
    this.systemContext = `SystemContext: ${systemContext}.`;
    this.contextWindow = contextWindow - this.systemContext.length;
    this.dbQueryOrchestrator = new LLMToolOrchestrator('An orchestrator that orchestrates the steps to query the movie database to answer the user query');
    this.dbQueryOrchestrator.addTool('movie_db_vectorizer', LLMClient.generateVector, 'Vectorize the user query so that it can be searched against the vector of the movie\'s plot');
    this.dbQueryOrchestrator.addTool('movie_db_searcher', MovieService.findMovieByPlotVector, 'Search the movie database using the vectorized user query to find relevant movies');
    logger.info(`ChatService initialized with system context: ${this.systemContext}`);
  }

  async startChat(): Promise<void> {
    logger.info('Starting chat interface');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    const initialPrompt = await LLMClient.generateText(`${this.systemContext}\nSYSTEM:`);
    console.log(initialPrompt);
    this.addChatToHistory('System', initialPrompt);
    rl.prompt();

    try {
      for await (const line of rl) {
        const input = line.trim();
        if (!input) {
          rl.prompt();
          continue;
        }

        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          rl.close();
          break;
        }

        await this.addChatToHistory('User', input);
        const response = await this.processInputAndGetResponse(input);
        await this.addChatToHistory('System', response);
        console.log(response);
        rl.prompt();
      }
    } finally {
      rl.close();
    }
  }

  private async processInputAndGetResponse(input: string): Promise<string> {
    const vectorSearchQuery = `${this.systemContext}\n${this.chatSoFar}\nUser: ${input}\n`;
    logger.info(`Processing user input. Handing over the query to the dbQueryOrchestrator.`);
    const additionalContextToAnswer = await this.dbQueryOrchestrator.handleUserRequest(vectorSearchQuery);
    logger.info(`Received additional context from dbQueryOrchestrator: ${additionalContextToAnswer}`);
    const enhancedQuery = `${vectorSearchQuery}\n(use the following context to answer the latest query: ${additionalContextToAnswer})\nSystem: `;
    const response = await LLMClient.generateText(enhancedQuery);
    return response;
  }

  private async addChatToHistory(user: string, input: string): Promise<void> {
    this.chatSoFar += `${user}: ${input}\n`;
    if (this.chatSoFar.length > this.contextWindow) {
      this.chatSoFar = this.chatSoFar.slice(this.chatSoFar.length - this.contextWindow);
    }
  }
}

export { ChatService };
