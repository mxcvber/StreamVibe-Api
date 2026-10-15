import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieListDto } from '../common/dto/movie-list.dto';
import { movieRatingWhere } from './movie-rating-filter';
import { movieSortQuery } from './movie-sort';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto';
import { TopTenMoviesDto } from './dto/top-10.dto';

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

  /**
   * One page of a genre's released movies, newest first.
   *
   * Released only, as in the New Releases carousel: "today" is the UTC date,
   * and `lte` excludes undated movies, which lets the planner use the partial
   * `(release_date DESC, id DESC) WHERE release_date IS NOT NULL` index. The
   * genre filter is an EXISTS on movie_genres checked per row of that walk, so
   * a rare genre reads further down the index per page than a common one —
   * negligible at the catalog's ~4.5k movies.
   *
   * Cursor-paginated on the last movie's id, as `findAll` is.
   */
  async findMoviesByGenre(
    genreId: number,
    { cursor, limit }: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    await this.assertGenreExists(genreId);

    // The cursor movie's release date, for the index bound below.
    const cursorMovie =
      cursor === undefined
        ? undefined
        : await this.prisma.movie.findUnique({
            where: { id: cursor },
            select: { releaseDate: true },
          });
    // Not a movie id, or an undated one this list never holds: no position
    // to continue from.
    if (cursorMovie === null || cursorMovie?.releaseDate === null) {
      return { items: [], nextCursor: null };
    }

    const rows = await this.prisma.movie.findMany({
      where: {
        genres: { some: { genreId } },
        // The second bound is redundant with Prisma's cursor predicate, which
        // Postgres can only apply as a filter; as an Index Cond it starts the
        // walk at the cursor, so a deep page costs the same as the first (see
        // movieSortQuery). `lte`, not `lt`: movies sharing the cursor's date
        // still have to come through for Prisma to sort out by id.
        AND: [
          { releaseDate: { lte: new Date() } },
          { releaseDate: { lte: cursorMovie?.releaseDate } },
        ],
      },
      // id breaks release-date ties and makes the cursor a plain movie id.
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
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

    // `lte` already excludes null. DATE comes back as UTC midnight; send the
    // plain "YYYY-MM-DD" so a browser west of UTC doesn't show the day before.
    return {
      items: page.map(({ releaseDate, ...movie }) => ({
        ...movie,
        releaseDate: releaseDate!.toISOString().slice(0, 10),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * A genre's 10 most popular movies, most popular first.
   *
   * `(popularity DESC, id DESC)` matches the movies browse index exactly, so
   * Postgres walks that index with no sort. The genre filter is an EXISTS on
   * movie_genres checked per row of that walk, so a rare genre reads further
   * down the index before it has 10 — negligible at the catalog's ~4.5k movies.
   */
  async findTopTenMoviesByGenre(genreId: number): Promise<TopTenMoviesDto> {
    await this.assertGenreExists(genreId);

    const items = await this.prisma.movie.findMany({
      where: { genres: { some: { genreId } } },
      // id breaks popularity ties.
      orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        title: true,
        posterPath: true,
        voteAverage: true,
      },
    });

    return { items };
  }

  /** A 404 for an unknown genre id, rather than an empty list. */
  private async assertGenreExists(genreId: number): Promise<void> {
    const genre = await this.prisma.genre.findUnique({
      where: { id: genreId },
      select: { id: true },
    });
    if (!genre) throw new NotFoundException(`Genre ${genreId} not found`);
  }
}
