import React, { useState, useEffect } from 'react';
import { Music, Users } from 'lucide-react';
import type { SubsonicAlbum, SubsonicSong, SubsonicArtist } from '@/lib/api/subsonicTypes';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { ArtistCoverArtImage } from '@/cover/ArtistCoverArtImage';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { COVER_DENSE_SEARCH_CSS_PX } from '@/cover/layoutSizes';
import { albumCoverRef } from '@/cover/ref';
import { coverEntryToRef, songOwnCoverEntry } from '@/cover/resolveEntry';
import { useServerIsNavidrome } from '@/cover/useLibraryCoverRef';
import { useAuthStore } from '@/store/authStore';
import { FETCH_QUEUE_BIAS_SEARCH_ARTIST_OVER_ALBUM } from '@/ui/CachedImage';
import { coverServerScopeForOwnerServerId } from '@/cover/serverScope';

export function LiveSearchAlbumThumb({
  albumId,
  coverArt,
  serverId,
  album,
}: {
  albumId: string;
  coverArt: string;
  serverId?: string;
  album?: Pick<SubsonicAlbum, 'name' | 'artist' | 'displayArtist'>;
}) {
  return (
    <AlbumCoverArtImage
      albumId={albumId}
      coverArt={coverArt}
      serverScope={serverId ? coverServerScopeForOwnerServerId(serverId) : undefined}
      libraryResolve={false}
      displayCssPx={COVER_DENSE_SEARCH_CSS_PX}
      surface="dense"
      className="search-result-thumb"
      alt=""
      ensurePriority="high"
      album={album}
    />
  );
}

export function LiveSearchSongThumb({ song }: { song: Pick<SubsonicSong, 'id' | 'albumId' | 'coverArt' | 'discNumber' | 'serverId' | 'album' | 'artist' | 'albumArtist' | 'displayAlbumArtist'> }) {
  // Search results carry the per-track `mf-…` coverArt id, which the cover
  // pipeline fails to resolve and the thumbnail goes blank. The album-scoped
  // `al-<albumId>_0` id is what actually loads (verified in the RC1 blank-thumb
  // investigation), and a song's search thumbnail is its album cover anyway —
  // so fetch the album cover from the albumId. Falls back to a music glyph when
  // there is no album to key on.
  const albumId = song.albumId?.trim();
  const songCoverArt = song.coverArt;
  const songId = song.id;
  // Fork patch: the song's own embedded cover. Results from the local index carry no
  // `mf-*` id; on Navidrome `mf-<songId>` is safe (it serves the album art when the
  // file has no picture of its own), as in usePlaybackTrackCoverRef.
  const isNavidrome = useServerIsNavidrome(song.serverId ?? useAuthStore.getState().activeServerId);
  const coverRef = React.useMemo(() => {
    const scope = song.serverId ? coverServerScopeForOwnerServerId(song.serverId) : undefined;
    const ownId = songCoverArt?.startsWith('mf-') ? songCoverArt : isNavidrome && songId ? `mf-${songId}` : '';
    const own = songOwnCoverEntry({ coverArt: ownId });
    if (own) return coverEntryToRef(own, scope);
    return albumId ? albumCoverRef(albumId, `al-${albumId}_0`, scope) : undefined;
  }, [albumId, songCoverArt, songId, isNavidrome, song.serverId]);
  if (!coverRef) return <div className="search-result-icon"><Music size={14} /></div>;
  return (
    <CoverArtImage
      coverRef={coverRef}
      displayCssPx={COVER_DENSE_SEARCH_CSS_PX}
      surface="dense"
      className="search-result-thumb"
      alt=""
      ensurePriority="high"
      ensureOpts={{
        artistName: song.displayAlbumArtist ?? song.albumArtist ?? song.artist,
        albumTitle: song.album,
      }}
    />
  );
}

export function LiveSearchArtistThumb({ artist }: { artist: Pick<SubsonicArtist, 'id' | 'coverArt' | 'serverId'> }) {
  const [failed, setFailed] = useState(false);
  // React Compiler set-state-in-effect rule: state set from an async result resolved in this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFailed(false); }, [artist.id, artist.coverArt, artist.serverId]);
  if (failed) return <div className="search-result-icon"><Users size={14} /></div>;
  return (
    <ArtistCoverArtImage
      artistId={artist.id}
      coverArt={artist.coverArt}
      serverScope={artist.serverId ? coverServerScopeForOwnerServerId(artist.serverId) : undefined}
      libraryResolve={false}
      displayCssPx={COVER_DENSE_SEARCH_CSS_PX}
      surface="dense"
      className="search-result-thumb"
      alt=""
      loading="eager"
      ensurePriority="high"
      fetchQueueBias={FETCH_QUEUE_BIAS_SEARCH_ARTIST_OVER_ALBUM}
      onError={() => setFailed(true)}
    />
  );
}
