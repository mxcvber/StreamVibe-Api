import { Controller, Get } from '@nestjs/common';
import { CarouselService } from './carousel.service';
import { MustWatchMoviesDto } from './dto/carousel-must-watch.dto';
import { NewReleasesDto } from './dto/carousel-new-releases.dto';
import { PopularMoviesDto } from './dto/carousel-popular-movies.dto';
import { TopInGenresDto } from './dto/carousel-top-movie-posters.dto';

@Controller('carousel')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get('top-in-genres')
  findTopMoviePosters(): Promise<TopInGenresDto> {
    return this.carouselService.findTopMoviePosters();
  }

  @Get('popular')
  findPopularMovies(): Promise<PopularMoviesDto> {
    return this.carouselService.findPopularMovies();
  }

  @Get('new-releases')
  findNewReleases(): Promise<NewReleasesDto> {
    return this.carouselService.findNewReleases();
  }

  @Get('must-watch')
  findMustWatchMovies(): Promise<MustWatchMoviesDto> {
    return this.carouselService.findMustWatchMovies();
  }
}
