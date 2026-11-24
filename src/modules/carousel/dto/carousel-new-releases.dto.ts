// Response of GET /api/v1/carousel/new-releases.
//
// `!` because nothing constructs these: the service returns plain objects
// typed as them, and they are classes only so the Swagger plugin can read
// them at runtime. Not `?` — the plugin derives `required` from it.

import { MoviePosterDto } from '../../../common/dto/movie-poster.dto';

export class CarouselNewReleaseDto extends MoviePosterDto {
  releaseDate!: string;
}
