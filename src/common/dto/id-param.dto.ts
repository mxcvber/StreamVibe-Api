import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { POSTGRES_INT_MAX } from '../constants';

export class IdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INT_MAX)
  id!: number;
}
