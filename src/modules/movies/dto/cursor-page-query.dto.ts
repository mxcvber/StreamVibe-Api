// @Type because the global ValidationPipe transforms but does not convert
// implicitly: without it, query params stay strings and @IsInt rejects them.

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { POSTGRES_INT_MAX } from '../../../common/constants';

export class CursorPageQueryDto {
  /** The `nextCursor` of the previous page; omit it for the first page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  cursor?: number;

  /** Movies per page. */
  // @ApiPropertyOptional on limit because the Swagger plugin marks any property
  // without `?` required.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
