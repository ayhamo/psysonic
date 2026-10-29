import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { commands } from '@/generated/bindings';
import { ndLogin } from '@/lib/api/navidromeAdmin';
import { getServerById } from '@/lib/api/subsonicClient';
import { connectBaseUrlForServer } from '@/lib/server/serverEndpoint';
import { useAuthStore } from '@/store/authStore';
import type { Track } from '@/lib/media/trackTypes';

/**
 * Fork patch: animated covers, two switches (Settings → Integrations).
 * - Covers: an animated WebP embedded in the song plays wherever the cover is
 *   shown; the cover cache keeps it animated (src-tauri cover_cache/fork_animated.rs).
 * - Fullscreen background: `<song file>.background.mp4`, served by the server at
 *   `/rest/x-clip/<folder>/<file>` behind Navidrome's login. Rust downloads it
 *   once and keeps it on disk (src-tauri/src/fork_clips.rs).
 */
export const useSongClipsStore = create<{
  covers: boolean;
  backdrops: boolean;
  /** Pause the clip while the window is not focused or hidden (saves GPU, like the visualizer). */
  pauseUnfocused: boolean;
  setCovers: (v: boolean) => void;
  setBackdrops: (v: boolean) => void;
  setPauseUnfocused: (v: boolean) => void;
}>()(
  persist(
    set => ({
      covers: true,
      backdrops: true,
      pauseUnfocused: true,
      setCovers: (covers: boolean) => set({ covers }),
      setBackdrops: (backdrops: boolean) => set({ backdrops }),
      setPauseUnfocused: (pauseUnfocused: boolean) => set({ pauseUnfocused }),
    }),
    { name: 'psysonic_fork_animated_covers' },
  ),
);

function syncCoverCache(enabled: boolean) {
  if (isTauri()) void commands.forkSetAnimatedCovers(enabled).catch(() => {});
}
syncCoverCache(useSongClipsStore.getState().covers);
useSongClipsStore.subscribe((s, prev) => {
  if (s.covers !== prev.covers) syncCoverCache(s.covers);
});

const tokens = new Map<string, Promise<string>>();
const clips = new Map<string, Promise<string>>();

function serverToken(serverId: string, baseUrl: string, fresh = false): Promise<string> {
  let hit = fresh ? undefined : tokens.get(serverId);
  if (!hit) {
    const server = getServerById(serverId);
    hit = server?.username && server.password
      ? ndLogin(baseUrl, server.username, server.password).then(r => r.token)
      : Promise.reject(new Error('no credentials'));
    tokens.set(serverId, hit);
    hit.catch(() => tokens.delete(serverId));
  }
  return hit;
}

/**
 * The clip as a file url ('' when the song has none). Rejects on a failure
 * (offline, server error, login) so the caller does not remember it.
 */
async function loadClip(serverId: string, songId: string): Promise<string> {
  const server = getServerById(serverId);
  if (!server || !isTauri()) return '';
  const baseUrl = connectBaseUrlForServer(server);
  for (const fresh of [false, true]) {
    const token = await serverToken(serverId, baseUrl, fresh);
    const res = await commands.forkSongBackgroundClip(baseUrl, token, songId);
    if (res.status === 'ok') return res.data ? convertFileSrc(res.data.replace(/\\/g, '/')) : '';
    if (!res.error.includes('401')) throw new Error(res.error); // only an expired login is worth one retry
  }
  throw new Error('login refused');
}

/** Forget a song's clip (failed lookup, or the file was removed), so the next showing asks Rust again. */
export function forgetBackgroundClip(url: string): void {
  for (const [key, hit] of clips) {
    void hit.then(u => { if (u === url && clips.get(key) === hit) clips.delete(key); });
  }
}

/** Background clip url for the playing song ('' while loading, when off, or when there is none). */
export function useSongBackgroundClip(track: Pick<Track, 'id' | 'serverId'> | null | undefined): string {
  const enabled = useSongClipsStore(s => s.backdrops);
  const serverId = track?.serverId ?? useAuthStore.getState().activeServerId ?? '';
  const songId = track?.id ?? '';
  const key = `${serverId}|${songId}`;
  const [state, setState] = useState<{ key: string; url: string }>({ key: '', url: '' });

  useEffect(() => {
    if (!enabled || !serverId || !songId) return;
    let alive = true;
    let hit = clips.get(key);
    if (!hit) {
      const loading = loadClip(serverId, songId).catch(() => {
        if (clips.get(key) === loading) clips.delete(key); // a failure is tried again next time
        return '';
      });
      hit = loading;
      if (clips.size > 500) clips.clear();
      clips.set(key, hit);
    }
    void hit.then(url => { if (alive) setState({ key, url }); });
    return () => { alive = false; };
  }, [enabled, key, serverId, songId]);

  return enabled && state.key === key ? state.url : '';
}

/** Bytes of background clips kept on this device. */
export async function backgroundClipsSize(): Promise<number> {
  if (!isTauri()) return 0;
  const res = await commands.forkBackgroundClipsSize();
  return res.status === 'ok' ? res.data : 0;
}

/** Delete the kept background clips; they download again when next shown. */
export async function clearBackgroundClips(): Promise<void> {
  clips.clear();
  if (isTauri()) await commands.forkClearBackgroundClips();
}
