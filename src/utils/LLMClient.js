class LLMClient {
    static ollamaUrl;
    static ollamaVectorizationModel;

    static async init() {
        // Initialize the LLM client here
        LLMClient.ollamaUrl = process.env.OLLAMA_API_URL;
        LLMClient.ollamaVectorizationModel = process.env.OLLAMA_VECTORIZATION_MODEL;
    }

    static async generateVector(text) {
        const response = await fetch(`${LLMClient.ollamaUrl}/api/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: LLMClient.ollamaVectorizationModel,
                prompt: text,
            }),
        });
        const data = await response.json();
        return data.embedding;
    }
}

module.exports = LLMClient;
