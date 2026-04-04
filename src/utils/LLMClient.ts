import got from 'got';
import { logger } from '../logger';

interface EmbeddingResponse {
  embedding: number[];
}

class LLMClient {
  private static ollamaUrl: string;
  private static ollamaVectorizationModel: string;
  private static ollamaGenerationModel: string;

  static async init(): Promise<void> {
    LLMClient.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    LLMClient.ollamaVectorizationModel = process.env.OLLAMA_VECTORIZATION_MODEL || 'qwen3-embedding';
    LLMClient.ollamaGenerationModel = process.env.OLLAMA_GENERATION_MODEL || 'qwen3';
    logger.info(`LLMClient initialized`);
  }

  static async generateVector(text: string): Promise<number[]> {
    logger.info(`Generating vector for text: ${text}`);
    const resp = await got.post(`${LLMClient.ollamaUrl}/api/embeddings`, {
      json: {
        model: LLMClient.ollamaVectorizationModel,
        prompt: text,
      },
      responseType: 'json',
    });
    const body = resp.body as EmbeddingResponse;
    logger.info(`Generated vector for text: ${text}: ${JSON.stringify(body.embedding)}`);
    return body.embedding;
  }

  static async generateText(prompt: string): Promise<string> {
    logger.info(`Generating text for prompt that ends with: ${prompt ? prompt.slice(-30) : ''}`);
    const resp = await got.post(`${LLMClient.ollamaUrl}/api/generate`, {
      json: {
        model: LLMClient.ollamaGenerationModel,
        prompt,
        stream: false
      },
      responseType: 'json',
      timeout: { request: 60000 } // Set a reasonable timeout for generation
    });
    const body = resp.body as { response: string, done: boolean };
    logger.info(`Generated text for prompt that ends with: ${prompt ? prompt.slice(-30) : ''}: ${JSON.stringify(body.response)}`);
    return body.response;
  }
}

export default LLMClient;
