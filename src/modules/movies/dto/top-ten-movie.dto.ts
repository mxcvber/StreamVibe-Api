import { MoviePosterDto } from '../../../common/dto/movie-poster.dto';

export class TopTenMovieDto extends MoviePosterDto {
  voteAverage!: number;
}
