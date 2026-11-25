/** A genre chip; its id links to the genre's movies. */
class GenreTagDto {
  id!: number;
  name!: string;
}

/** Shared base of a cast and a crew card: the person the credit is for. */
export class CreditPersonDto {
  id!: number;
  name!: string;
  profilePath!: string | null;
}

export class CastMemberDto extends CreditPersonDto {
  character!: string | null;
}

export class CrewMemberDto extends CreditPersonDto {
  jobs!: string[];
}

export class MovieDetailDto {
  id!: number;
  title!: string;
  tagline!: string | null;
  overview!: string | null;
  posterPath!: string;
  backdropPath!: string | null;
  trailerKey!: string;
  releaseDate!: string | null;
  runtime!: number | null;
  budget!: number | null;
  revenue!: number | null;
  homepage!: string | null;
  originCountry!: string[];
  voteAverage!: number;
  streamVibeRating!: number | null;
  reviewCount!: number;
  genres!: GenreTagDto[];
  cast!: CastMemberDto[];
  crew!: CrewMemberDto[];
}
