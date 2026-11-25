import { Injectable, NotFoundException } from '@nestjs/common';
import { toCalendarDate } from '../../common/utils/to-calendar-date';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CursorPageQueryDto } from './dto/cursor-page-query.dto';
import { ListMoviesQueryDto } from './dto/list-movies-query.dto';
import { MovieDetailDto } from './dto/movie-detail.dto';
import { MovieListDto } from './dto/movie-list.dto';
import { TopTenMovieDto } from './dto/top-ten-movie.dto';
import { movieCreditsWhere, toCastAndCrew } from './utils/movie-credits';
import { movieListSelect, toMovieList } from './utils/movie-list';
import { movieRatingWhere } from './utils/movie-rating-filter';
import {
  movieCursorSelect,
  movieSortQuery,
  type MovieOrder,
} from './utils/movie-sort';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({
    sort,
    rating,
    ...page
  }: ListMoviesQueryDto): Promise<MovieListDto> {
    return this.findPage(sort, movieRatingWhere(rating), page);
  }

  async findOne(id: number): Promise<MovieDetailDto> {
    const movie = await this.prisma.movie.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        tagline: true,
        overview: true,
        posterPath: true,
        backdropPath: true,
        trailerKey: true,
        releaseDate: true,
        runtime: true,
        budget: true,
        revenue: true,
        homepage: true,
        originCountry: true,
        voteAverage: true,
        reviewCount: true,
        ratingSum: true,
        genres: {
          orderBy: { genre: { name: 'asc' } },
          select: { genre: { select: { id: true, name: true } } },
        },
        credits: {
          where: movieCreditsWhere,
          orderBy: [{ order: 'asc' }, { person: { popularity: 'desc' } }],
          select: {
            kind: true,
            character: true,
            job: true,
            person: { select: { id: true, name: true, profilePath: true } },
          },
        },
      },
    });

    if (!movie) throw new NotFoundException(`Movie ${id} not found`);

    const {
      releaseDate,
      budget,
      revenue,
      ratingSum,
      reviewCount,
      genres,
      credits,
      ...rest
    } = movie;

    return {
      ...rest,
      releaseDate: releaseDate && toCalendarDate(releaseDate),
      budget: budget === null ? null : Number(budget),
      revenue: revenue === null ? null : Number(revenue),
      streamVibeRating: reviewCount > 0 ? ratingSum / reviewCount : null,
      reviewCount,
      genres: genres.map(({ genre }) => genre),
      ...toCastAndCrew(credits),
    };
  }

  async findMoviesByGenre(
    genreId: number,
    page: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    await this.assertGenreExists(genreId);

    return this.findPage('released', { genres: { some: { genreId } } }, page);
  }

  async findTopTenMoviesByGenre(genreId: number): Promise<TopTenMovieDto[]> {
    await this.assertGenreExists(genreId);

    return this.prisma.movie.findMany({
      where: { genres: { some: { genreId } } },
      orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        title: true,
        posterPath: true,
        voteAverage: true,
      },
    });
  }

  private async findPage(
    order: MovieOrder,
    filter: Prisma.MovieWhereInput,
    { cursor, limit }: CursorPageQueryDto,
  ): Promise<MovieListDto> {
    const cursorMovie =
      cursor === undefined
        ? undefined
        : await this.prisma.movie.findUnique({
            where: { id: cursor },
            select: movieCursorSelect,
          });

    if (cursorMovie === null) return { items: [], nextCursor: null };

    const sortQuery = movieSortQuery(order, cursorMovie);

    if (!sortQuery) return { items: [], nextCursor: null };

    const rows = await this.prisma.movie.findMany({
      where: { AND: [sortQuery.where, filter] },
      orderBy: sortQuery.orderBy,

      // One extra row tells whether a next page exists, without a count query.
      take: limit + 1,
      select: movieListSelect,
    });

    return toMovieList(rows, limit);
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
