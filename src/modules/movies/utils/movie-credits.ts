import { CreditKind, Prisma } from '../../../generated/prisma/client';
import {
  CastMemberDto,
  CreditPersonDto,
  CrewMemberDto,
} from '../dto/movie-detail.dto';

const CAST_LIMIT = 20;

const CREW_LIMIT = 20;

const KEY_CREW_JOBS = [
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

/** A credit as MoviesService.findOne selects it. */
type MovieCredit = {
  kind: CreditKind;
  character: string | null;
  job: string | null;
  person: CreditPersonDto;
};

// The credits the movie page shows: top-billed cast and key crew.
export const movieCreditsWhere: Prisma.CreditWhereInput = {
  OR: [
    { kind: CreditKind.CAST, order: { lt: CAST_LIMIT } },
    { kind: CreditKind.CREW, job: { in: KEY_CREW_JOBS } },
  ],
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
  const roles = new Map<
    number,
    { person: CreditPersonDto; characters: Set<string> }
  >();
  for (const { kind, character, person } of credits) {
    if (kind !== CreditKind.CAST) continue;

    const role = roles.get(person.id) ?? { person, characters: new Set() };

    if (character) role.characters.add(character);
    roles.set(person.id, role);
  }

  const cast = [...roles.values()].map(({ person, characters }) => ({
    ...person,
    character: [...characters].join(' / ') || null,
  }));

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
