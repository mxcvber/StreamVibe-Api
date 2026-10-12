import { Injectable, NotFoundException } from '@nestjs/common';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto';
import { MovieListDto } from '../common/dto/movie-list.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GenresService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Cursor-paginated on the last movie's id, as GET /movies is.
   */
  async findMovies(
    genreId: number,
    { cursor, limit }: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    const genre = await this.prisma.genre.findUnique({
      where: { id: genreId },
      select: { id: true },
    });
    if (!genre) throw new NotFoundException(`Genre ${genreId} not found`);

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
}
