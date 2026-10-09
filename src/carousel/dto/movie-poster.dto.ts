// Shared base of every carousel tile; each carousel's DTO extends it with
// the fields its tile adds.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

/** A movie reduced to what a poster tile needs. */
export class MoviePosterDto {
  /** TMDB movie id. */
  id!: number;
  title!: string;
  /** TMDB image path ("/abc123.jpg"); the frontend builds the image URL. */
  posterPath!: string;
}
