// Response of GET /api/v1/movies/:id/genre/top-10.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from '../../common/dto/movie-poster.dto';

/** A movie reduced to what a top-10 tile needs. */
export class TopTenMovieDto extends MoviePosterDto {
  /** TMDB average, 0–10; the frontend halves it for the 5-star display. */
  voteAverage!: number;
}

/** Rows wrapped in `items` so pagination fields can join later without a break. */
export class TopTenMoviesDto {
  /** Most popular first. */
  items!: TopTenMovieDto[];
}
