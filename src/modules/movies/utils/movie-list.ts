import { toCalendarDate } from '../../../common/utils/to-calendar-date';
import { Prisma } from '../../../generated/prisma/client';
import { MovieListDto } from '../dto/movie-list.dto';

export const movieListSelect = {
  id: true,
  title: true,
  posterPath: true,
  releaseDate: true,
  voteAverage: true,
} satisfies Prisma.MovieSelect;

type MovieListRow = Prisma.MovieGetPayload<{ select: typeof movieListSelect }>;

export function toMovieList(rows: MovieListRow[], limit: number): MovieListDto {
  const page = rows.slice(0, limit);

  return {
    items: page.map(({ releaseDate, ...movie }) => ({
      ...movie,
      releaseDate: releaseDate && toCalendarDate(releaseDate),
    })),

    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}
