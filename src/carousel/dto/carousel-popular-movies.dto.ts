// Response of GET /api/v1/carousel/popular.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from './movie-poster.dto';

/** A movie reduced to what a popular-carousel tile needs. */
export class PopularMovieDto extends MoviePosterDto {
  /** Minutes; null when TMDB had no runtime (it sends 0, the importer stores null). */
  runtime!: number | null;
}

/** Rows wrapped in `items` so pagination fields can join later without a break. */
export class PopularMoviesDto {
  /** Most popular first. */
  items!: PopularMovieDto[];
}
