// Response of GET /api/v1/movies/:id.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

/** A genre chip; its id links to the genre's movies. */
export class GenreTagDto {
  /** TMDB genre id. */
  id!: number;
  name!: string;
}

/** Shared base of a cast and a crew card: the person the credit is for. */
export class CreditPersonDto {
  /** TMDB person id. */
  id!: number;
  name!: string;
  /** TMDB image path; null when TMDB has no photo. */
  profilePath!: string | null;
}

export class CastMemberDto extends CreditPersonDto {
  /** The role; null when TMDB names none. */
  character!: string | null;
}

export class CrewMemberDto extends CreditPersonDto {
  /** This person's key jobs on the movie, highest-ranked first. */
  jobs!: string[];
}

/** Everything the movie page shows except its reviews. */
export class MovieDetailDto {
  /** TMDB movie id. */
  id!: number;
  title!: string;
  tagline!: string | null;
  overview!: string | null;
  /** TMDB image path ("/abc123.jpg"); the frontend builds the image URL. */
  posterPath!: string;
  /** Landscape hero image; null for a few movies — use the poster then. */
  backdropPath!: string | null;
  /** YouTube video id of the trailer. */
  trailerKey!: string;
  /** "YYYY-MM-DD"; null when TMDB had no release date. */
  releaseDate!: string | null;
  /** Minutes; null when unknown. */
  runtime!: number | null;
  /** Null when unknown, as is revenue. */
  budget!: number | null;
  revenue!: number | null;
  homepage!: string | null;
  /** ISO 3166-1 codes, e.g. "IN". */
  originCountry!: string[];
  /** TMDB average, 0–10; the frontend halves it for the 5-star display. */
  voteAverage!: number;
  /** StreamVibe review average, 1–5; null until the movie has a review. */
  streamVibeRating!: number | null;
  reviewCount!: number;
  /** By name. */
  genres!: GenreTagDto[];
  /** Top-billed, lead first. */
  cast!: CastMemberDto[];
  /** Key jobs only, one entry per person. */
  crew!: CrewMemberDto[];
}
