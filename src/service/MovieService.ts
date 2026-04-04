import { logger } from '../logger';
import DBClient from '../utils/DBClient';

interface MovieDocument {
  plot: string;
  genres: string[];
  cast: string[];
  title: string;
  languages: string[];
  directors: string[];
  writers: string[];
  awards: string[];
  type: string;
}

class MovieService {
  static async findMovieByPlotVector(plotVector: number[], maxMoviesToReturn: number): Promise<MovieDocument[]> {
    logger.info(`Finding movies by plot vector: ${plotVector}`);
    const pipeline = [
      {
        $vectorSearch: {
          index: 'vectorPlotIndex',
          path: 'plotembedding',
          queryVector: plotVector,
          numCandidates: maxMoviesToReturn * 10,
          limit: maxMoviesToReturn,
        },
        $project: {
            _id: 0,
            plot: 1,
            genres: 1,
            cast: 1,
            title: 1,
            languages: 1,
            directors: 1,
            writers: 1,
            awards: 1,
            type: 1
        }
      },
    ];

    const db = DBClient.getDB();
    const results = await db.collection<MovieDocument>('movies').aggregate(pipeline).toArray();
    logger.info(`Found ${results.length} movies`);
    return results as MovieDocument[];
  }
}

export { MovieService };
