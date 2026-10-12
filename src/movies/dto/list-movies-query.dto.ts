// Query of GET /api/v1/movies: the cursor page plus sort and rating.
//
// @Type because the global ValidationPipe transforms but does not convert
// implicitly: without it, query params stay strings and @IsInt rejects them.
// @ApiPropertyOptional on sort because the Swagger plugin marks any property
// without `?` required; `?` would make it `| undefined` past the default. It
// also lists the values, which the plugin cannot read off a string union.

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CursorPageQueryDto } from '../../common/dto/cursor-page-query.dto';
import { MOVIE_SORTS, type MovieSort } from '../movie-sort';

export class ListMoviesQueryDto extends CursorPageQueryDto {
  /** Order of the list. `newest` lists upcoming movies only, soonest first. */
  @ApiPropertyOptional({ enum: MOVIE_SORTS })
  @IsOptional()
  @IsIn(MOVIE_SORTS)
  sort: MovieSort = 'popular';

  /**
   * Only movies whose card shows this many stars or half a star more, from
   * at least 30 TMDB votes.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
