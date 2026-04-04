import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import LLMClient from '../../src/utils/LLMClient';
import DBClient from '../../src/utils/DBClient';

dotenv.config();

const COLLECTION_NAME = process.env.MONGODB_COLLECTION_MOVIE || 'movies';
const BATCH_SIZE = Number(process.env.MONGODB_BATCH_SIZE) || 500;

interface ParsedArgs {
  drop: boolean;
  dryRun: boolean;
  limit: number | null;
}

interface MovieDocument {
  _id?: string;
  title: string;
  plot?: string;
  fullplot?: string;
  num_mflix_comments?: number;
  plot_embedding?: number[];
  plotembedding?: number[];
  [key: string]: any;
}

function parseArgs(): ParsedArgs {
  const args: ParsedArgs = { drop: false, dryRun: false, limit: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--drop') args.drop = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--limit=')) {
      const parsed = Number(a.split('=')[1]);
      args.limit = !isNaN(parsed) ? parsed : null;
    }
  }
  return args;
}

async function run(): Promise<void> {
  const { drop, dryRun, limit } = parseArgs();

  const filePath = path.join(__dirname, 'embedded_movies.json');
  if (!fs.existsSync(filePath)) {
    console.error('Data file not found:', filePath);
    process.exit(1);
  }

  console.log(`Reading data from ${filePath} ...`);
  const raw = fs.readFileSync(filePath, 'utf8');
  let docs: MovieDocument[];
  try {
    docs = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse JSON:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!Array.isArray(docs)) {
    console.error('Expected an array of documents in embedded_movies.json');
    process.exit(1);
  }

  const total = docs.length;
  const count = limit ? Math.min(limit, total) : total;
  console.log(
    `Found ${total} documents in file; preparing to ${dryRun ? '[dry-run] ' : ''}process ${count} documents`
  );

  if (dryRun) {
    console.log('Dry run: no connection to MongoDB will be made.');
    console.log('Example first document keys:', Object.keys(docs[0] || {}).slice(0, 20));
    console.log('To perform the real import, run:');
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const DB_NAME = process.env.MONGODB_NAME || 'sample_mflix';
    console.log(
      `  MONGODB_URI="${MONGODB_URI}" MONGODB_NAME=${DB_NAME} node ${__filename} --drop`
    );
    return;
  }

  try {
    await LLMClient.init();
    const db = await DBClient.init();
    const col = db.collection<MovieDocument>(COLLECTION_NAME);

    if (drop) {
      console.log(`Dropping existing collection ${COLLECTION_NAME} (if exists)`);
      try {
        await col.drop();
      } catch (e) {
        // ignore if doesn't exist
      }
    }

    // insert in batches
    let inserted = 0;
    const totalRecords = docs.length;
    let moviecount = 0;

    for (let i = 0; i < count; i += BATCH_SIZE) {
      const chunk = docs.slice(i, Math.min(i + BATCH_SIZE, count));
      if (chunk.length === 0) break;

      console.log(`Processing chunk: ${i} - ${i + BATCH_SIZE}`);
      const filteredData: MovieDocument[] = [];

      for (const doc of chunk) {
        console.log('=============================================');
        console.log(`Processing document number: ${++moviecount}/${totalRecords}`);
        console.log(`Cleaning up document: ${doc.title}`);

        delete doc._id;
        delete doc.num_mflix_comments;
        delete doc.plot_embedding;

        console.log(`Generating embedding for document: ${doc.title}`);
        doc.plotembedding = await LLMClient.generateVector(doc.fullplot ? doc.fullplot : doc.plot || '');
        console.log(`Generated embedding for document: ${doc.title}`);
        filteredData.push(doc);
        console.log(`Processed document (yet to be inserted): ${doc.title}`);
        console.log('=============================================');
      }

      console.log(`Inserting documents ${i} - ${i + filteredData.length} ...`);
      const res = await col.insertMany(filteredData, { ordered: false });
      inserted += res.insertedCount || 0;
      console.log(`Inserted ${inserted}/${count} documents`);
    }

    console.log(`Done. Inserted ${inserted} documents into ${COLLECTION_NAME}`);
  } catch (err) {
    console.error('Error during import:', err);
    process.exitCode = 1;
  } finally {
    await DBClient.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
