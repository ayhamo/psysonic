import { useThemeStore } from '@/store/themeStore';
import { useArtistFanart } from '@/cover/useArtistFanart';
import { backdropFromConfig } from '@/cover/artistBackdrop';
import { useArtistCoverRef, usePlaybackTrackCoverRef } from '@/cover/useLibraryCoverRef';
import { useIsArtistPlaceholder } from '@/cover/useIsArtistPlaceholder';
import { useLeadArtist } from '@/features/fullscreenPlayer/hooks/forkLeadArtist';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { useCachedUrl } from '@/ui/CachedImage';
import type { Track } from '@/lib/media/trackTypes';

/**
 * Resolves the fullscreen-player artist backdrop URL through the shared cover
 * pipeline, in the user's configured source order (fanart.tv → Navidrome artist
 * image), honouring the per-surface enable toggle. Returns '' when the backdrop
 * is disabled or nothing resolves.
 *
 * Single source of truth for all three fullscreen player styles — no player
 * re-derives the backdrop; they all call this.
 */
export function useFsArtistBackdrop(currentTrack: Track | null): string {
  const cfg = useThemeStore(s => s.backdrops.fullscreenPlayer);
  const ownFanart = useArtistFanart(currentTrack?.artistId, {
    artistName: currentTrack?.artist,
    albumTitle: currentTrack?.album,
    trackTitle: currentTrack?.title, // fork patch: second MusicBrainz try
  });
  // Fork patch: a combined artist ("A X B") without a backdrop falls back to A's.
  const lead = useLeadArtist(currentTrack, ownFanart);
  const leadFanart = useArtistFanart(lead.id || undefined, { artistName: lead.name, albumTitle: currentTrack?.album, trackTitle: currentTrack?.title });
  const fanart = lead.id ? leadFanart : ownFanart;
  const artistCoverRef =
    useArtistCoverRef(currentTrack?.artistId, undefined, undefined, { libraryResolve: false }) ?? undefined;
  const artistImage = usePlaybackCoverArt(artistCoverRef, 2000, { fullRes: true });
  const artistImgUrl = useCachedUrl(artistImage.src, artistImage.cacheKey, true);
  // Fork patch: Navidrome's star placeholder (artist without a picture) is
  // replaced by the song's own cover; nothing is shown while it is checked.
  const placeholder = useIsArtistPlaceholder(artistImgUrl);
  // Only fetched once the placeholder is confirmed: a real artist image never needs it.
  const songCoverRef = usePlaybackTrackCoverRef(currentTrack ?? undefined);
  const songCover = usePlaybackCoverArt(placeholder === true ? songCoverRef : undefined, 2000, { fullRes: true });
  const songCoverUrl = useCachedUrl(songCover.src, songCover.cacheKey, true);
  const navidrome = placeholder === false ? artistImgUrl : placeholder ? songCoverUrl : '';

  return cfg.enabled
    ? backdropFromConfig(cfg.sources, { fanart, navidrome }).url
    : '';
}
