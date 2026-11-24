// Response of GET /api/v1/carousel/top-in-genres.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime.

import { MoviePosterDto } from '../../../common/dto/movie-poster.dto';

export class CarouselTopInGenresDto {
  id!: number;
  name!: string;
  movies!: MoviePosterDto[];
}
