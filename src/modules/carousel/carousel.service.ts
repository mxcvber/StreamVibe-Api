import { Injectable } from '@nestjs/common';
import { toCalendarDate } from '../../common/utils/to-calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { CarouselMustWatchDto } from './dto/carousel-must-watch.dto';
import { CarouselNewReleasesDto } from './dto/carousel-new-releases.dto';
import { CarouselTopInGenresDto } from './dto/carousel-top-in-genres.dto';
import { CarouselTrendingNowDto } from './dto/carousel-trending-now.dto';

const TRENDING_NOW_WINDOW = 100;

@Injectable()
export class CarouselService {
  constructor(private readonly prisma: PrismaService) {}

  async findTopInGenres(): Promise<CarouselTopInGenresDto[]> {
    const rows = await this.prisma.genre.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        movies: {
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
    return rows.map(({ movies, ...genre }) => ({
      ...genre,
      movies: movies.map(({ movie }) => movie),
    }));
  }

  async findTrendingNowMovies(): Promise<CarouselTrendingNowDto[]> {
    const today = new Date();

    const cutoff = await this.prisma.movie.findFirst({
      where: { releaseDate: { lte: today } },
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
      skip: TRENDING_NOW_WINDOW - 1,
      select: { releaseDate: true },
    });

    return this.prisma.movie.findMany({
      where: {
        releaseDate: {
          lte: today,
          ...(cutoff?.releaseDate && { gte: cutoff.releaseDate }),
        },
      },
      orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        id: true,
        title: true,
        posterPath: true,
        runtime: true,
      },
    });
  }

  // The newest already-released movies, for the New Releases carousel.
  async findNewReleases(): Promise<CarouselNewReleasesDto[]> {
    const rows = await this.prisma.movie.findMany({
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
    return rows.map(({ releaseDate, ...movie }) => ({
      ...movie,
      releaseDate: toCalendarDate(releaseDate!),
    }));
  }

  // The highest-rated movies, for the Must-Watch carousel.
  findMustWatchMovies(): Promise<CarouselMustWatchDto[]> {
    return this.prisma.movie.findMany({
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
  }
}
