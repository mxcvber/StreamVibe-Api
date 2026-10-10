import { Controller, Get, Query } from '@nestjs/common';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieListDto } from './dto/movie-list.dto';
import { MoviesService } from './movies.service';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get()
  findAll(@Query() query: ListMoviesQueryDto): Promise<MovieListDto> {
    return this.moviesService.findAll(query);
  }
}
