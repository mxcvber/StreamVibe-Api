import { TRAILER_KEY_MAX_LENGTH } from './tmdb-import.constants';
import type { TmdbVideo } from './tmdb.types';

// Lower ranks first. The rule: official trailer, else any trailer, else a
// teaser — with "official" reused as the tie-break among teasers. Clips,
// featurettes and the rest are never candidates.
function rank(video: TmdbVideo): number | null {
  if (video.type === 'Trailer') {
    return video.official ? 0 : 1;
  }
  if (video.type === 'Teaser') {
    return video.official ? 2 : 3;
  }
  return null;
}

/**
 * The single YouTube key stored in movies.trailer_key, or null when the
 * movie's (English-tagged or untagged) videos hold no trailer or teaser.
 * Within a rank the most recently published video wins.
 */
export function pickTrailerKey(videos: TmdbVideo[]): string | null {
  let best: TmdbVideo | undefined;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const video of videos) {
    if (
      video.site !== 'YouTube' ||
      !video.key ||
      video.key.length > TRAILER_KEY_MAX_LENGTH
    ) {
      continue;
    }
    const videoRank = rank(video);
    if (videoRank === null) {
      continue;
    }
    if (
      videoRank < bestRank ||
      (videoRank === bestRank && publishedAt(video) > publishedAt(best))
    ) {
      best = video;
      bestRank = videoRank;
    }
  }

  return best?.key ?? null;
}

function publishedAt(video: TmdbVideo | undefined): number {
  const time = video ? Date.parse(video.published_at) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}
