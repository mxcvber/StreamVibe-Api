import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto';
import { MovieListDto } from '../common/dto/movie-list.dto';
import { GenresService } from './genres.service';

@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  /** A genre's released movies, newest first. `id` is the TMDB genre id. */
  @Get(':id/movies')
  findMovies(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    return this.genresService.findMovies(id, query);
  }
}
