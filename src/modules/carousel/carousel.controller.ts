import { CarouselTrendingNowDto } from './dto/carousel-trending-now.dto';
import { Controller, Get } from '@nestjs/common';
import { CarouselService } from './carousel.service';
import { CarouselMustWatchDto } from './dto/carousel-must-watch.dto';
import { CarouselNewReleaseDto } from './dto/carousel-new-releases.dto';
import { CarouselTopInGenresDto } from './dto/carousel-top-in-genres.dto';

@Controller('carousel')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get('top-in-genres')
  findTopMoviePosters(): Promise<CarouselTopInGenresDto[]> {
    return this.carouselService.findTopMoviePosters();
  }

  @Get('trending-now')
  findTrendingNowMovies(): Promise<CarouselTrendingNowDto[]> {
    return this.carouselService.findTrendingNowMovies();
  }

  @Get('new-releases')
  findNewReleases(): Promise<CarouselNewReleaseDto[]> {
    return this.carouselService.findNewReleases();
  }

  @Get('must-watch')
  findMustWatchMovies(): Promise<CarouselMustWatchDto[]> {
    return this.carouselService.findMustWatchMovies();
  }
}
