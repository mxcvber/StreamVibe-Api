import { CreditKind, Prisma } from '../../generated/prisma/client';
import {
  CastMemberDto,
  CreditPersonDto,
  CrewMemberDto,
} from './dto/movie-detail.dto';

/** Top-billed cast on the movie page. TMDB lists up to ~400 per movie. */
export const CAST_LIMIT = 20;

/** Crew cards on the movie page, after each person's jobs are merged. */
export const CREW_LIMIT = 20;

/**
 * The crew jobs the movie page shows, highest-ranked first. TMDB lists up to
 * ~1,000 crew per movie, mostly stunts, makeup and effects; these jobs average
 * ~10 credits.
 */
export const KEY_CREW_JOBS = [
  'Director',
  'Screenplay',
  'Writer',
  'Story',
  'Novel',
  'Original Music Composer',
  'Director of Photography',
  'Editor',
  'Producer',
];

/**
 * The credits the movie page shows: top-billed cast and key crew.
 *
 * A where rather than a nested `take`, so Postgres does the trimming — the
 * cast half is a range on the (movie_id, kind, cast_order) index — instead of
 * Prisma loading every credit and slicing in memory, which it can do with a
 * nested `take` (see carousel.service.ts).
 */
export const movieCreditsWhere: Prisma.CreditWhereInput = {
  OR: [
    { kind: CreditKind.CAST, order: { lt: CAST_LIMIT } },
    { kind: CreditKind.CREW, job: { in: KEY_CREW_JOBS } },
  ],
};

/** A credit as MoviesService.findOne selects it. */
export type MovieCredit = {
  kind: CreditKind;
  character: string | null;
  job: string | null;
  person: CreditPersonDto;
};

/**
 * Splits credits fetched with movieCreditsWhere into the page's cast and crew.
 *
 * Cast keeps the fetched (billing) order. Crew is ranked by KEY_CREW_JOBS and
 * then merged per person, so a director who also wrote the screenplay is one
 * card with both jobs rather than two cards of the same face.
 */
export function toCastAndCrew(credits: MovieCredit[]): {
  cast: CastMemberDto[];
  crew: CrewMemberDto[];
} {
  const cast = credits
    .filter((credit) => credit.kind === CreditKind.CAST)
    .map(({ person, character }) => ({ ...person, character }));

  // `job &&` only narrows the type: movieCreditsWhere lets no null job through.
  // The sort is stable, so people with the same job stay most popular first.
  const crewCredits = credits
    .flatMap(({ kind, job, person }) =>
      kind === CreditKind.CREW && job ? [{ job, person }] : [],
    )
    .sort(
      (a, b) => KEY_CREW_JOBS.indexOf(a.job) - KEY_CREW_JOBS.indexOf(b.job),
    );

  // A person's highest-ranked job places their card; later jobs join it.
  const crew = new Map<number, CrewMemberDto>();
  for (const { job, person } of crewCredits) {
    const member = crew.get(person.id);
    if (!member) crew.set(person.id, { ...person, jobs: [job] });
    else if (!member.jobs.includes(job)) member.jobs.push(job);
  }

  return { cast, crew: [...crew.values()].slice(0, CREW_LIMIT) };
}
