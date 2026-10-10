// Response of GET /api/v1/carousel/top-in-genres.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from '../../common/dto/movie-poster.dto';

export class GenreDto {
  /** TMDB genre id. */
  id!: number;
  name!: string;
  /** Most popular first; empty for a genre with no movies. */
  movies!: MoviePosterDto[];
}

/** Rows wrapped in `items` so pagination fields can join later without a break. */
export class TopInGenresDto {
  items!: GenreDto[];
}
