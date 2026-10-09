// Response of GET /api/v1/carousel/must-watch.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from './movie-poster.dto';

/** A movie reduced to what a must-watch tile needs. */
export class MustWatchMovieDto extends MoviePosterDto {
  /** Minutes; null when TMDB had no runtime (it sends 0, the importer stores null). */
  runtime!: number | null;
  /** TMDB average, 0–10; the frontend halves it for the 5-star display. */
  voteAverage!: number;
  /** TMDB vote count, raw; the frontend abbreviates it ("20K"). */
  voteCount!: number;
}

/** Rows wrapped in `items` so pagination fields can join later without a break. */
export class MustWatchMoviesDto {
  /** Highest weighted rating first. */
  items!: MustWatchMovieDto[];
}
