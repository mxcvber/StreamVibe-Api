import { CreditKind, Gender } from '../generated/prisma/client';
import {
  DEPARTMENT_MAX_LENGTH,
  IMAGE_PATH_MAX_LENGTH,
  KEYWORD_NAME_MAX_LENGTH,
} from './tmdb-import.constants';
import type {
  TmdbCastMember,
  TmdbCrewMember,
  TmdbMovieDetails,
} from './tmdb.types';

// Postgres SMALLINT; runtime and cast_order use it. TMDB does hold a few
// runtimes above it (multi-day experimental films), stored as unknown.
const SMALLINT_MAX = 32_767;

/** A payload that passed the import invariant: non-adult, with a poster. */
export type StorableMovieDetails = TmdbMovieDetails & {
  adult: false;
  poster_path: string;
};

export function isStorable(
  details: TmdbMovieDetails,
): details is StorableMovieDetails {
  return !details.adult && Boolean(details.poster_path);
}

// One row per table, typed as the SQL columns the ChunkWriter binds — plain
// values rather than Prisma's createMany inputs, because the writer speaks
// raw SQL (see chunk-writer.service.ts for why).
export interface MovieRow {
  id: number;
  title: string;
  overview: string | null;
  tagline: string | null;
  /** "YYYY-MM-DD", validated, or null. */
  releaseDate: string | null;
  runtime: number | null;
  budget: bigint | null;
  revenue: bigint | null;
  homepage: string | null;
  posterPath: string;
  backdropPath: string | null;
  trailerKey: string;
  originCountry: string[];
  popularity: number;
  voteAverage: number;
  voteCount: number;
  collectionId: number | null;
  syncedAt: Date;
}

export interface CollectionRow {
  id: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface PersonRow {
  id: number;
  name: string;
  gender: Gender;
  knownForDepartment: string | null;
  profilePath: string | null;
  popularity: number;
}

export interface KeywordRow {
  id: number;
  name: string;
}

export interface CreditRow {
  id: string;
  movieId: number;
  personId: number;
  kind: CreditKind;
  character: string | null;
  order: number | null;
  department: string | null;
  job: string | null;
}

/** One movie's rows for every catalog table. */
export interface MappedMovie {
  movie: MovieRow;
  collection: CollectionRow | null;
  genreIds: number[];
  keywords: KeywordRow[];
  people: PersonRow[];
  credits: CreditRow[];
}

/**
 * Pure translation from TMDB's payload to this schema's rows. Every catalog
 * primary key is the TMDB id, so nothing here looks anything up. The trailer
 * key arrives already resolved: choosing it may take a second request
 * (TmdbImportService.resolveTrailerKey), which does not belong in a mapper.
 * So do the genre ids, already filtered to known genres by the check that
 * decides whether the movie is stored at all.
 */
export function mapMovie(
  details: StorableMovieDetails,
  trailerKey: string,
  genreIds: number[],
  syncedAt: Date,
): MappedMovie {
  // First occurrence wins when the same person is in cast and crew — the
  // person fields are identical either way, only the credit differs.
  const people = new Map<number, PersonRow>();
  const credits: CreditRow[] = [];

  for (const member of details.credits?.cast ?? []) {
    if (!people.has(member.id)) {
      people.set(member.id, mapPerson(member));
    }
    credits.push({
      id: member.credit_id,
      movieId: details.id,
      personId: member.id,
      kind: CreditKind.CAST,
      character: emptyToNull(member.character),
      // 0-based billing position: 0 is the lead, not "unknown".
      order: castOrderOrNull(member.order),
      department: null,
      job: null,
    });
  }

  for (const member of details.credits?.crew ?? []) {
    if (!people.has(member.id)) {
      people.set(member.id, mapPerson(member));
    }
    credits.push({
      id: member.credit_id,
      movieId: details.id,
      personId: member.id,
      kind: CreditKind.CREW,
      character: null,
      order: null,
      department: clipOrNull(member.department, DEPARTMENT_MAX_LENGTH),
      job: emptyToNull(member.job),
    });
  }

  const collection = details.belongs_to_collection;

  return {
    movie: {
      id: details.id,
      title: details.title || details.original_title,
      overview: emptyToNull(details.overview),
      tagline: emptyToNull(details.tagline),
      releaseDate: dateOrNull(details.release_date),
      // TMDB sends 0 for "unknown" on all three; the schema stores null.
      runtime: smallIntOrNull(details.runtime),
      budget: bigIntOrNull(details.budget),
      revenue: bigIntOrNull(details.revenue),
      homepage: emptyToNull(details.homepage),
      posterPath: clip(details.poster_path, IMAGE_PATH_MAX_LENGTH),
      backdropPath: clipOrNull(details.backdrop_path, IMAGE_PATH_MAX_LENGTH),
      trailerKey,
      originCountry: details.origin_country ?? [],
      popularity: details.popularity ?? 0,
      voteAverage: details.vote_average ?? 0,
      voteCount: details.vote_count ?? 0,
      collectionId: collection?.id ?? null,
      syncedAt,
    },
    collection: collection
      ? {
          id: collection.id,
          name: collection.name,
          posterPath: clipOrNull(collection.poster_path, IMAGE_PATH_MAX_LENGTH),
          backdropPath: clipOrNull(
            collection.backdrop_path,
            IMAGE_PATH_MAX_LENGTH,
          ),
        }
      : null,
    genreIds,
    keywords: (details.keywords?.keywords ?? []).map((keyword) => ({
      id: keyword.id,
      name: clip(keyword.name, KEYWORD_NAME_MAX_LENGTH),
    })),
    people: [...people.values()],
    credits,
  };
}

function mapPerson(member: TmdbCastMember | TmdbCrewMember): PersonRow {
  return {
    id: member.id,
    name: member.name,
    gender: mapGender(member.gender),
    knownForDepartment: clipOrNull(
      member.known_for_department,
      DEPARTMENT_MAX_LENGTH,
    ),
    profilePath: clipOrNull(member.profile_path, IMAGE_PATH_MAX_LENGTH),
    popularity: member.popularity ?? 0,
  };
}

function mapGender(gender: number): Gender {
  switch (gender) {
    case 1:
      return Gender.FEMALE;
    case 2:
      return Gender.MALE;
    case 3:
      return Gender.NON_BINARY;
    default:
      return Gender.UNKNOWN;
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

function clip(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function clipOrNull(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  return value ? clip(value, maxLength) : null;
}

// "YYYY-MM-DD" or "" from TMDB. A bad value would fail the ::date cast and
// take its whole chunk down, so it must be a real calendar date: V8 turns
// "2023-02-30" into March 2 rather than rejecting it, hence the round trip.
function dateOrNull(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

// For values where TMDB's 0 means "unknown" (runtime).
function smallIntOrNull(value: number | null | undefined): number | null {
  return value && value > 0 && value <= SMALLINT_MAX ? Math.trunc(value) : null;
}

function castOrderOrNull(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }
  return value >= 0 && value <= SMALLINT_MAX ? value : null;
}

function bigIntOrNull(value: number | null | undefined): bigint | null {
  return value && Number.isFinite(value) && value > 0
    ? BigInt(Math.trunc(value))
    : null;
}
