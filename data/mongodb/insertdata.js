
const fs = require('fs');
const path = require('path');

// Config via env or CLI args
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'sample_mflix';
const COLLECTION_NAME = process.env.COLLECTION || 'movies';
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;

function parseArgs() {
	const args = { drop: false, dryRun: false, limit: null };
	for (let i = 2; i < process.argv.length; i++) {
		const a = process.argv[i];
		if (a === '--drop') args.drop = true;
		else if (a === '--dry-run') args.dryRun = true;
		else if (a.startsWith('--limit=')) args.limit = Number(a.split('=')[1]) || null;
	}
	return args;
}

async function run() {
	const { drop, dryRun, limit } = parseArgs();

	const filePath = path.join(__dirname, 'embedded_movies.json');
	if (!fs.existsSync(filePath)) {
		console.error('Data file not found:', filePath);
		process.exit(1);
	}

	console.log(`Reading data from ${filePath} ...`);
	const raw = fs.readFileSync(filePath, 'utf8');
	let docs;
	try {
		docs = JSON.parse(raw);
	} catch (err) {
		console.error('Failed to parse JSON:', err.message);
		process.exit(1);
	}

	if (!Array.isArray(docs)) {
		console.error('Expected an array of documents in embedded_movies.json');
		process.exit(1);
	}

	const total = docs.length;
	const count = limit ? Math.min(limit, total) : total;
	console.log(`Found ${total} documents in file; preparing to ${dryRun ? '[dry-run] ' : ''}process ${count} documents`);

	if (dryRun) {
		console.log('Dry run: no connection to MongoDB will be made.');
		console.log('Example first document keys:', Object.keys(docs[0] || {}).slice(0, 20));
		console.log('To perform the real import, run:');
		console.log('  MONGODB_URI="' + MONGODB_URI + '" DB_NAME=' + DB_NAME + ' node ' + __filename + ' --drop');
		return;
	}

	// lazy require so dry-run doesn't need the package installed
	let MongoClient;
	try {
		MongoClient = require('mongodb').MongoClient;
	} catch (err) {
		console.error('Missing dependency "mongodb". Install with: npm install mongodb');
		process.exit(1);
	}

	const client = new MongoClient(MONGODB_URI);
	try {
		await client.connect();
		const db = client.db(DB_NAME);
		const col = db.collection(COLLECTION_NAME);

		if (drop) {
			console.log(`Dropping existing collection ${DB_NAME}.${COLLECTION_NAME} (if exists)`);
			try { await col.drop(); } catch (e) { /* ignore if doesn't exist */ }
		}

		// insert in batches
		let inserted = 0;
		for (let i = 0; i < count; i += BATCH_SIZE) {
			const chunk = docs.slice(i, Math.min(i + BATCH_SIZE, count));
			if (chunk.length === 0) break;
			const res = await col.insertMany(chunk, { ordered: false });
			inserted += res.insertedCount || 0;
			console.log(`Inserted ${inserted}/${count} documents`);
		}

		console.log(`Done. Inserted ${inserted} documents into ${DB_NAME}.${COLLECTION_NAME}`);
	} catch (err) {
		console.error('Error during import:', err);
		process.exitCode = 1;
	} finally {
		await client.close();
	}
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});
