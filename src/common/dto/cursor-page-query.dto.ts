// Cursor and page size of every cursor-paginated list; a route's query DTO
// extends it with its own filters.
//
// @Type because the global ValidationPipe transforms but does not convert
// implicitly: without it, query params stay strings and @IsInt rejects them.
// @ApiPropertyOptional on limit because the Swagger plugin marks any property
// without `?` required; `?` would make it `| undefined` past the default.

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CursorPageQueryDto {
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
}
