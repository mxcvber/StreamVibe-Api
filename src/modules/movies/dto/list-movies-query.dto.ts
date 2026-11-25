import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MOVIE_SORTS, type MovieSort } from '../utils/movie-sort';
import { CursorPageQueryDto } from './cursor-page-query.dto';

export class ListMoviesQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: MOVIE_SORTS })
  @IsOptional()
  @IsIn(MOVIE_SORTS)
  sort: MovieSort = 'popular';

  // @Type because the global ValidationPipe transforms but does not convert
  // implicitly: without it, query params stay strings and @IsInt rejects them.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
