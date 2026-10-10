// Response of GET /api/v1/carousel/new-releases.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from '../../common/dto/movie-poster.dto';

/** A movie reduced to what a new-releases tile needs. */
export class NewReleaseMovieDto extends MoviePosterDto {
  /** "YYYY-MM-DD" — a calendar date, so no timestamp to shift across time zones. */
  releaseDate!: string;
}

/** Rows wrapped in `items` so pagination fields can join later without a break. */
export class NewReleasesDto {
  /** Newest first; already released only. */
  items!: NewReleaseMovieDto[];
}
