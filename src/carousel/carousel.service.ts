import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CarouselDto } from './dto/carousel-top-movie-posters.dto';

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
  async findTopMoviePosters(): Promise<CarouselDto> {
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
}
