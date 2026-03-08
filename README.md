/**
 * Project: Movie Chatbot using RAG with MongoDB and Ollama
 *
 * Description:
 * This project implements a Retrieval-Augmented Generation (RAG) chat bot that lets users
 * talk about movies. It stores movie documents and (optionally) embeddings in MongoDB,
 * uses a local Ollama instance as the LLM (and/or embedding provider), and serves conversational
 * responses by retrieving relevant movie context and prompting Ollama for generation.
 *
 * Test data:
 * The sample dataset used for testing can be downloaded from:
 * https://huggingface.co/datasets/MongoDB/embedded_movies/blob/main/sample_mflix.embedded_movies.json
 *
 * Architecture overview:
 * - Data layer: MongoDB holds movie documents, metadata, and vector embeddings (if generated).
 * - Retrieval layer: Perform nearest-neighbor search over vectors stored in MongoDB (or an
 *   external vector index if preferred) to obtain top-k relevant movie passages for a query.
 * - Generation layer: Build a prompt that includes retrieved context + a system/instruction message,
 *   then send the prompt to a locally running Ollama instance to produce the chat response.
 * - API layer: Accepts user messages, manages conversation state (optional), orchestrates retrieval
 *   and generation, and returns the response to the user.
 *
 * Requirements / Prerequisites:
 * - MongoDB instance (local or Atlas). If using MongoDB vector search features, ensure your server
 *   version supports vector operations (or store vectors and use a separate vector index).
 * - Ollama installed and running locally. Pull or run the language model you intend to use.
 * - Node.js (or Python) environment and any required client libraries for MongoDB and HTTP requests.
 * - Test dataset (link above) downloaded and ingested into MongoDB.
 *
 * Environment variables / config (suggested):
 * - MONGODB_URI     = mongodb://user:pass@host:port/?authSource=...
 * - MONGODB_DB      = name of database (e.g., "mflix")
 * - MONGODB_COLL    = collection name (e.g., "movies")
 * - OLLAMA_HOST     = host for Ollama (default: "http://localhost")
 * - OLLAMA_PORT     = port for Ollama API (default: 11434)
 * - OLLAMA_MODEL    = name of the model running in Ollama
 * - TOP_K           = number of retrieved passages to include in prompt (e.g., 3-5)
 *
 * Data ingestion / indexing notes:
 * - The provided test dataset contains movie documents and may include embeddings already.
 *   If embeddings are not present or you want to re-generate them, use Ollama (or another
 *   embedding provider) to compute fixed-size vectors for each passage/document and store
 *   them in MongoDB alongside the original data.
 * - If your MongoDB deployment supports vector search, create a vector index on the field
 *   that stores embeddings. Otherwise, consider an external vector store (e.g., FAISS, Weaviate).
 * - Normalize and split long movie documents into passages to improve retrieval precision.
 *
 * Typical request/response flow:
 * 1. Receive user message (and optional conversation history).
 * 2. Compute or obtain an embedding for the user message.
 * 3. Query MongoDB to retrieve top-k similar passages (by cosine/dot-product similarity).
 * 4. Construct a prompt that includes:
 *    - A system message describing the assistant persona and instructions (e.g., be helpful, cite sources).
 *    - Retrieved passages with source attribution (title, year, or document ID).
 *    - Recent user/assistant turns (optional) for conversational context.
 *    - The current user query.
 * 5. Send the assembled prompt to the local Ollama model and receive generated text.
 * 6. Return the model output to the user, and optionally store the exchange in conversation logs.
 *
 * Prompting tips:
 * - Keep retrieved passages concise; include only the most relevant information to avoid prompt bloat.
 * - Ask the model to explicitly cite or reference the source document ID or title when grounding answers.
 * - Provide clear system-level instructions to control style, length, and safety constraints.
 *
 * Safety, privacy, and moderation:
 * - Sanitize and validate user inputs before embedding or constructing prompts.
 * - Avoid leaking sensitive information from stored documents.
 * - Implement content filtering or moderation on model outputs if your use-case requires it.
 *
 * Testing and evaluation:
 * - Use the provided Hugging Face sample dataset to test ingestion, retrieval, and generation.
 * - Evaluate quality by measuring retrieval recall and the factuality/grounding of generated answers.
 * - Log retrieval hits and model responses to iterate on prompt design and retrieval parameters (TOP_K).
 *
 * Deployment notes:
 * - Ollama runs locally; ensure the service is monitored and restarted if needed.
 * - For production scale, consider horizontal scaling of the API layer and a managed vector DB
 *   or MongoDB cluster with vector search support.
 *
 * Troubleshooting:
 * - If retrieval returns irrelevant passages, increase passage granularity or re-generate embeddings.
 * - If Ollama responses are hallucinating, include stronger instructions and more retrieved context,
 *   and reduce ambiguous system prompts.
 * - Check connectivity and authentication for MongoDB and ensure Ollama model endpoint is reachable.
 *
 * License:
 * - Default project license: MIT (adjust as needed).
 *
 * Acknowledgements:
 * - Test dataset from: https://huggingface.co/datasets/MongoDB/embedded_movies
 *
 */
# Run ollama
A local LLM runtime (ollama) is used to run models locally for embeddings and quick testing.
This repo uses the `qwen3-embedding` model to produce embeddings for RAG/lookup workflows.
```bash
ollama pull qwen3-embedding
```

## Test ollama image
```bash
curl http://localhost:11434/api/embeddings -d '{
  "model": "qwen3-embedding",
  "prompt": "A movie about a man who travels through time in a DeLorean."
}'
```


## Database management

This project includes a small MongoDB helper and sample data under `data/mongodb/`.

### Start MongoDB (Docker)

Start a local MongoDB using the provided compose file:

```bash
docker compose up -d ./data/mongodb/
```

The compose file exposes port 27017 and configures a root username/password (see `data/mongodb/docker-compose.yml`). If you changed the credentials, set `MONGODB_URI` accordingly when importing.

### Stop MongoDB

```bash
docker compose -f data/mongodb/docker-compose.yml down
```

### Import embedded movie data

1) Install Node dependencies (adds the MongoDB driver used by the importer):

```bash
npm install
```

2) Dry-run to verify the JSON and see the first document keys (safe, no DB writes):

```bash
node data/mongodb/insertdata.js --dry-run
```
Test data downloaded from: https://huggingface.co/datasets/MongoDB/embedded_movies/blob/main/sample_mflix.embedded_movies.json

3) Perform the real import. Default settings assume a local, unauthenticated MongoDB at `mongodb://localhost:27017` and will write to database `sample_mflix` and collection `movies`.

Drop existing collection and import all documents:

```bash
MONGODB_URI="mongodb://localhost:27017" DB_NAME=sample_mflix node data/mongodb/insertdata.js --drop
```

Import with a limit and custom batch size:

```bash
BATCH_SIZE=200 MONGODB_URI="mongodb://localhost:27017" DB_NAME=sample_mflix node data/mongodb/insertdata.js --limit=500
```

If your MongoDB requires auth (the compose file sets `admin/password` by default), use a URI with credentials:

```bash
MONGODB_URI="mongodb://admin:password@localhost:27017/?authSource=admin" DB_NAME=sample_mflix node data/mongodb/insertdata.js --drop
```

Notes:
- The inserter uses `insertMany(..., { ordered: false })` so single-document issues don't abort the entire import.
- The script reads the JSON file into memory. For very large files you may prefer a streaming importer — tell me if you want that change.

### Inspect the data

Use the Mongo shell (if installed) to connect and list documents:

```bash
mongo --username admin --password password --host localhost --port 27017 --authenticationDatabase admin
use sample_mflix
db.movies.find().limit(5).pretty()
```

Or connect with MongoDB Compass using the connection string:

```
mongodb://admin:password@localhost:27017/?authSource=admin
```

### Troubleshooting

- If Docker fails to start the MongoDB image, ensure Docker has enough memory (the compose suggests a 4G limit).
- If imports fail with duplicate key errors or schema issues, re-run with `--drop` or use `--limit` to isolate problematic documents.
