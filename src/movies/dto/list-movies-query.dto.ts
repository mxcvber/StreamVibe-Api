// Query of GET /api/v1/movies.
//
// @Type because the global ValidationPipe transforms but does not convert
// implicitly: without it, query params stay strings and @IsInt rejects them.
// @ApiPropertyOptional on limit and sort because the Swagger plugin marks any
// property without `?` required; `?` would make it `| undefined` past the
// default. On sort it also lists the values, which the plugin cannot read off
// a string union.

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MOVIE_SORTS, type MovieSort } from '../movie-sort';

export class ListMoviesQueryDto {
  /** The `nextCursor` of the previous page; omit it for the first page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  /** Movies per page. */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

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
