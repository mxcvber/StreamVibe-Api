// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

export class MoviePosterDto {
  id!: number;
  title!: string;
  posterPath!: string;
}
