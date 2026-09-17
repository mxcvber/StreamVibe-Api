/**
 * The parts of TMDB's payloads the import reads. Deliberately not the full
 * shapes: anything not listed here is ignored, so a field TMDB adds or renames
 * elsewhere cannot break the import.
 */

// One line of the daily id export (movie_ids_MM_DD_YYYY.json.gz).
export interface TmdbExportLine {
  adult: boolean;
  id: number;
  original_title: string;
  popularity: number;
  video: boolean;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

export interface TmdbCollectionSummary {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbVideo {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
  id: string;
}

// GET /movie/{id}/videos — the standalone form, used for the
// original-language fallback.
export interface TmdbVideosResponse {
  id: number;
  results: TmdbVideo[];
}

interface TmdbCreditPerson {
  id: number;
  name: string;
  // 0 unknown, 1 female, 2 male, 3 non-binary.
  gender: number;
  known_for_department: string | null;
  profile_path: string | null;
  popularity: number;
  credit_id: string;
}

export interface TmdbCastMember extends TmdbCreditPerson {
  character: string;
  order: number;
}

export interface TmdbCrewMember extends TmdbCreditPerson {
  department: string;
  job: string;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

// GET /movie/{id}?append_to_response=videos,credits,keywords — the appended
// sub-resources arrive as extra top-level keys named after the request.
export interface TmdbMovieDetails {
  id: number;
  adult: boolean;
  title: string;
  original_title: string;
  original_language: string;
  overview: string | null;
  tagline: string | null;
  // "YYYY-MM-DD" or "" when unknown.
  release_date: string;
  // 0 means unknown on all three.
  runtime: number | null;
  budget: number;
  revenue: number;
  homepage: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  origin_country?: string[];
  popularity: number;
  vote_average: number;
  vote_count: number;
  genres: TmdbGenre[];
  belongs_to_collection: TmdbCollectionSummary | null;
  videos: { results: TmdbVideo[] };
  credits: { cast: TmdbCastMember[]; crew: TmdbCrewMember[] };
  keywords: { keywords: TmdbKeyword[] };
}
