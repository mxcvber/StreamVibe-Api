import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MustWatchMoviesDto } from './dto/carousel-must-watch.dto';
import { NewReleasesDto } from './dto/carousel-new-releases.dto';
import { PopularMoviesDto } from './dto/carousel-popular-movies.dto';
import { TopInGenresDto } from './dto/carousel-top-movie-posters.dto';

@Injectable()
export class CarouselService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every genre, by name, with the posters of its 4 most popular movies.
   *
   * Prisma's default relation loading applies the nested `take` in memory: it
   * loads every movie–genre row (~12k for the current 4.5k movies) and keeps
   * 4 per genre.
   */
  async findTopMoviePosters(): Promise<TopInGenresDto> {
    const rows = await this.prisma.genre.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        movies: {
          // `movies` holds movie_genres join rows, so sort by the movie each
          // one points to; movieId breaks popularity ties.
          orderBy: [{ movie: { popularity: 'desc' } }, { movieId: 'desc' }],
          take: 4,
          select: {
            movie: {
              select: {
                id: true,
                title: true,
                posterPath: true,
              },
            },
          },
        },
      },
    });

    // Unwrap each join row to the movie it points to.
    return {
      items: rows.map(({ movies, ...genre }) => ({
        ...genre,
        movies: movies.map(({ movie }) => movie),
      })),
    };
  }

  /**
   * The most popular movies, for the Movies page carousel.
   *
   * `(popularity DESC, id DESC)` matches the movies browse index exactly, so
   * Postgres reads the first entries of that index and stops — no sort.
   */
  async findPopularMovies(): Promise<PopularMoviesDto> {
    const items = await this.prisma.movie.findMany({
      // id breaks popularity ties.
      orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        title: true,
        posterPath: true,
        runtime: true,
      },
    });

    return { items };
  }

  /**
   * The newest already-released movies, for the New Releases carousel.
   *
   * Served by the partial `(release_date DESC, id DESC) WHERE release_date IS
   * NOT NULL` index: `<= today` implies NOT NULL, so Postgres starts at today
   * in that index and reads 20 entries — no sort.
   */
  async findNewReleases(): Promise<NewReleasesDto> {
    const rows = await this.prisma.movie.findMany({
      // Released only: the catalog holds announced movies dated up to a year
      // out. "Today" is per request, so they join on their release date. It is
      // the UTC date: the pg adapter sends a Date for a DATE column through
      // its UTC getters. TMDB release dates carry no time zone anyway.
      where: { releaseDate: { lte: new Date() } },
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        title: true,
        posterPath: true,
        releaseDate: true,
      },
    });

    // `lte` already excludes null. DATE comes back as UTC midnight; send the
    // plain "YYYY-MM-DD" so a browser west of UTC doesn't show the day before.
    return {
      items: rows.map(({ releaseDate, ...movie }) => ({
        ...movie,
        releaseDate: releaseDate!.toISOString().slice(0, 10),
      })),
    };
  }

  /**
   * The highest-rated movies, for the Must-Watch carousel.
   *
   * Ranked by the Bayesian `weighted_rating`, not raw `vote_average`, so a
   * movie with a handful of perfect votes cannot reach the top. `(weighted_rating
   * DESC, id DESC)` matches its browse index exactly — no sort.
   */
  async findMustWatchMovies(): Promise<MustWatchMoviesDto> {
    const items = await this.prisma.movie.findMany({
      // id breaks rating ties.
      orderBy: [{ weightedRating: 'desc' }, { id: 'desc' }],
      take: 16,
      select: {
        id: true,
        title: true,
        posterPath: true,
        runtime: true,
        voteAverage: true,
        voteCount: true,
      },
    });

    return { items };
  }
}
