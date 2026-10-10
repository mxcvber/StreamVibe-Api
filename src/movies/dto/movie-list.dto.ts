// Response of GET /api/v1/movies.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from '../../common/dto/movie-poster.dto';

/** A movie reduced to what a catalog grid card needs. */
export class MovieListItemDto extends MoviePosterDto {
  /** "YYYY-MM-DD"; null when TMDB had no release date. */
  releaseDate!: string | null;
  /** TMDB average, 0–10. */
  voteAverage!: number;
}

export class MovieListDto {
  /** In the requested `sort` order. */
  items!: MovieListItemDto[];
  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor!: number | null;
}
