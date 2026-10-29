import { useEffect, useState } from 'react';
import { searchForServer } from '@/lib/api/subsonicSearch';
import { useAuthStore } from '@/store/authStore';
import type { ArtistImage } from '@/cover/useArtistFanart';
import type { Track } from '@/lib/media/trackTypes';

/**
 * Fork patch: a song tagged with a combined artist ("BLACKPINK X SELENA GOMEZ",
 * "DJ Snake, Selena Gomez") is one Navidrome artist without a MusicBrainz ID, so
 * fanart.tv cannot be asked. When that artist has no backdrop, the first name is
 * looked up as an artist of its own and its backdrop is used instead.
 */

/** First credited name of a combined artist, or '' when the name is a single artist. */
export function leadArtistName(name: string): string {
  const lead = name.split(/\s+(?:x|×|&|feat\.?|ft\.?|with|vs\.?)\s+|\s*[,;/]\s*/i)[0]?.trim() ?? '';
  return lead && lead.toLowerCase() !== name.trim().toLowerCase() ? lead : '';
}

const leads = new Map<string, Promise<string>>();

function findArtistId(serverId: string, name: string): Promise<string> {
  const key = `${serverId}|${name.toLowerCase()}`;
  let hit = leads.get(key);
  if (!hit) {
    hit = searchForServer(serverId, name, { artistCount: 10, albumCount: 0, songCount: 0 })
      .then(r => r.artists.find(a => a.name.trim().toLowerCase() === name.toLowerCase())?.id ?? '')
      .catch(() => {
        leads.delete(key); // a failed search is tried again next time
        return '';
      });
    if (leads.size > 300) leads.clear();
    leads.set(key, hit);
  }
  return hit;
}

/** The lead artist to ask for a backdrop, once the song's own artist has none ('' otherwise). */
export function useLeadArtist(track: Track | null, ownFanart: ArtistImage): { id: string; name: string } {
  const name = leadArtistName(track?.artist ?? '');
  const serverId = track?.serverId ?? useAuthStore.getState().activeServerId ?? '';
  const wanted = Boolean(name && serverId && !ownFanart.src && !ownFanart.pending);
  const key = `${serverId}|${name}`;
  const [found, setFound] = useState<{ key: string; id: string }>({ key: '', id: '' });

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    void findArtistId(serverId, name).then(id => { if (alive) setFound({ key, id }); });
    return () => { alive = false; };
  }, [wanted, key, serverId, name]);

  const id = wanted && found.key === key && found.id !== track?.artistId ? found.id : '';
  return { id, name: id ? name : '' };
}
