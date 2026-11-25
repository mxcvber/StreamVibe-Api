import { Controller, Get, Param, Query } from '@nestjs/common';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { CursorPageQueryDto } from './dto/cursor-page-query.dto';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieDetailDto } from './dto/movie-detail.dto';
import { MovieListDto } from './dto/movie-list.dto';
import { TopTenMovieDto } from './dto/top-ten-movie.dto';
import { MoviesService } from './movies.service';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Get()
  findAll(@Query() query: ListMoviesQueryDto): Promise<MovieListDto> {
    return this.moviesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param() { id }: IdParamDto): Promise<MovieDetailDto> {
    return this.moviesService.findOne(id);
  }

  @Get(':id/genre')
  findMoviesByGenre(
    @Param() { id }: IdParamDto,
    @Query() query: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    return this.moviesService.findMoviesByGenre(id, query);
  }

  @Get(':id/genre/top-10')
  findTopTenMoviesByGenre(
    @Param() { id }: IdParamDto,
  ): Promise<TopTenMovieDto[]> {
    return this.moviesService.findTopTenMoviesByGenre(id);
  }
}
