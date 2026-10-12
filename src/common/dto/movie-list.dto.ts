// Response of GET /api/v1/movies and GET /api/v1/genres/:id/movies.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from './movie-poster.dto';

/** A movie reduced to what a catalog grid card needs. */
export class MovieListItemDto extends MoviePosterDto {
  /** "YYYY-MM-DD"; null when TMDB had no release date. */
  releaseDate!: string | null;
  /** TMDB average, 0–10. */
  voteAverage!: number;
}

export class MovieListDto {
  /** In the route's order: the requested `sort` on /movies, newest first on a genre. */
  items!: MovieListItemDto[];
  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor!: number | null;
}
