import { Controller, Get } from '@nestjs/common';
import { CarouselService } from './carousel.service';
import { CarouselDto } from './dto/carousel-top-movie-posters.dto';

@Controller('carousel')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get('top-in-genres')
  findTopMoviePosters(): Promise<CarouselDto> {
    return this.carouselService.findTopMoviePosters();
  }
}
