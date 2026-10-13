import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieListDto } from '../common/dto/movie-list.dto';
import { MoviesService } from './movies.service';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto';
import { TopTenMoviesDto } from './dto/top-10.dto';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get()
  findAll(@Query() query: ListMoviesQueryDto): Promise<MovieListDto> {
    return this.moviesService.findAll(query);
  }

  /** A genre's released movies, newest first. `id` is the TMDB genre id. */
  @Get(':id/genre')
  findMoviesByGenre(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    return this.moviesService.findMoviesByGenre(id, query);
  }

  @Get('top-10')
  findTopTenMovies(): Promise<TopTenMoviesDto> {
    return this.moviesService.findTopTenMovies();
  }
}
