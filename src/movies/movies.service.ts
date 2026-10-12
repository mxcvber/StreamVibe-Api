import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieListDto } from '../common/dto/movie-list.dto';
import { movieRatingWhere } from './movie-rating-filter';
import { movieSortQuery } from './movie-sort';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the whole catalog, in the requested sort, optionally narrowed
   * to one star rating.
   *
   * Cursor-paginated on the last movie's id: Prisma looks up that movie's
   * position in the ordering and continues after it.
   */
  async findAll({
    cursor,
    limit,
    sort,
    rating,
  }: ListMoviesQueryDto): Promise<MovieListDto> {
    // The cursor movie's sort values, for the index bound in movieSortQuery.
    const cursorMovie =
      cursor === undefined
        ? undefined
        : await this.prisma.movie.findUnique({
            where: { id: cursor },
            select: {
              popularity: true,
              voteAverage: true,
              releaseDate: true,
            },
          });
    // Not a movie id, or not one this sort can hold: no position to continue from.
    if (cursorMovie === null) return { items: [], nextCursor: null };
    const sortQuery = movieSortQuery(sort, cursorMovie);
    if (!sortQuery) return { items: [], nextCursor: null };

    const rows = await this.prisma.movie.findMany({
      where: { AND: [sortQuery.where, movieRatingWhere(rating)] },
      orderBy: sortQuery.orderBy,
      // skip: 1 leaves out the cursor movie itself, the last of the previous page.
      ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
      // One extra row tells whether a next page exists, without a count query.
      take: limit + 1,
      select: {
        id: true,
        title: true,
        posterPath: true,
        releaseDate: true,
        voteAverage: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // DATE comes back as UTC midnight; send the plain "YYYY-MM-DD" so a browser
    // west of UTC doesn't show the day before.
    return {
      items: page.map(({ releaseDate, ...movie }) => ({
        ...movie,
        releaseDate: releaseDate?.toISOString().slice(0, 10) ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
