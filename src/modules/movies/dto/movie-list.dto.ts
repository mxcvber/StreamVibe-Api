import { MoviePosterDto } from '../../../common/dto/movie-poster.dto';

class MovieListItemDto extends MoviePosterDto {
  releaseDate!: string | null;
  voteAverage!: number;
}

export class MovieListDto {
  items!: MovieListItemDto[];

  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor!: number | null;
}
