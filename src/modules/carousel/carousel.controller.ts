import { Controller, Get } from '@nestjs/common';
import { CarouselService } from './carousel.service';
import { CarouselMustWatchDto } from './dto/carousel-must-watch.dto';
import { CarouselNewReleasesDto } from './dto/carousel-new-releases.dto';
import { CarouselTopInGenresDto } from './dto/carousel-top-in-genres.dto';
import { CarouselTrendingNowDto } from './dto/carousel-trending-now.dto';

@Controller('carousel')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get('top-in-genres')
  findTopInGenres(): Promise<CarouselTopInGenresDto[]> {
    return this.carouselService.findTopInGenres();
  }

  @Get('trending-now')
  findTrendingNowMovies(): Promise<CarouselTrendingNowDto[]> {
    return this.carouselService.findTrendingNowMovies();
  }

  @Get('new-releases')
  findNewReleases(): Promise<CarouselNewReleasesDto[]> {
    return this.carouselService.findNewReleases();
  }

  @Get('must-watch')
  findMustWatchMovies(): Promise<CarouselMustWatchDto[]> {
    return this.carouselService.findMustWatchMovies();
  }
}
