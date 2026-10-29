import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsToggle } from '@/features/settings/components/SettingsToggle';
import { backgroundClipsSize, clearBackgroundClips, useSongClipsStore } from '@/cover/songClips';

/**
 * Fork patch: the animated covers switches (see src/cover/songClips.ts), shown in
 * Integrations → Fork settings. English only, like the rest of the fork.
 */
export function ForkSongClipsControls() {
  const covers = useSongClipsStore(s => s.covers);
  const backdrops = useSongClipsStore(s => s.backdrops);
  const setCovers = useSongClipsStore(s => s.setCovers);
  const setBackdrops = useSongClipsStore(s => s.setBackdrops);
  const pauseUnfocused = useSongClipsStore(s => s.pauseUnfocused);
  const setPauseUnfocused = useSongClipsStore(s => s.setPauseUnfocused);
  const [size, setSize] = useState(0);
  const refreshSize = useCallback(() => { void backgroundClipsSize().then(setSize); }, []);
  useEffect(refreshSize, [refreshSize]);

  // One box per switch, like upstream's sections, so they do not run together.
  return (
    <>
      <SettingsGroup>
        <SettingsToggle
          label="Animated covers"
          desc="Songs with a cover clip on the server play it over the cover in Now Playing and the fullscreen player; the normal cover shows first. Each clip is downloaded once and kept on this device. Covers that are an animated image also keep moving."
          note="Embedded animated images cached while this was on stay animated until the cover cache is cleared (Storage → Cover art cache)."
          checked={covers}
          onChange={setCovers}
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsToggle
          label="Animated video backdrops"
          desc="Songs with a background clip on the server play it behind the fullscreen player. Each clip is downloaded once and kept on this device, up to the limit in Cache size limits. The film button in the fullscreen player switches this too."
          checked={backdrops}
          onChange={setBackdrops}
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsToggle
          label="Pause video when Psysonic is not focused"
          desc="Cover and backdrop videos stop while you are in another window, like the visualizer, and go on when you come back. Saves GPU and battery."
          checked={pauseUnfocused}
          onChange={setPauseUnfocused}
        />
      </SettingsGroup>
      <SettingsGroup>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 13, alignSelf: 'flex-start' }}
          onClick={async () => {
            await clearBackgroundClips();
            refreshSize();
          }}
        >
          <Trash2 size={14} /> Clear cover and backdrop videos ({(size / 1024 / 1024).toFixed(0)} MB)
        </button>
      </SettingsGroup>
    </>
  );
}
