import { useCallback, useEffect, useState } from 'react';
import { Film, Trash2 } from 'lucide-react';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsToggle } from '@/features/settings/components/SettingsToggle';
import { backgroundClipsSize, clearBackgroundClips, useSongClipsStore } from '@/cover/songClips';

/** Fork patch: the animated covers switches (see src/cover/songClips.ts). English only, like the rest of the fork. */
export function ForkSongClipsSection() {
  const covers = useSongClipsStore(s => s.covers);
  const backdrops = useSongClipsStore(s => s.backdrops);
  const setCovers = useSongClipsStore(s => s.setCovers);
  const setBackdrops = useSongClipsStore(s => s.setBackdrops);
  const pauseUnfocused = useSongClipsStore(s => s.pauseUnfocused);
  const setPauseUnfocused = useSongClipsStore(s => s.setPauseUnfocused);
  const [size, setSize] = useState(0);
  const refreshSize = useCallback(() => { void backgroundClipsSize().then(setSize); }, []);
  useEffect(refreshSize, [refreshSize]);

  return (
    <SettingsSubSection
      title="Animated covers and video backdrops"
      icon={<Film size={16} />}
      searchText="animated covers video backdrops canvas clips motion artwork background pause focus"
    >
      <div className="settings-card">
        <SettingsGroup>
          <SettingsToggle
            label="Animated covers"
            desc="Songs whose cover is an animated image play it wherever the cover is shown (list thumbnails stay still)."
            note="Covers cached while this was on stay animated until the cover cache is cleared (Storage → Cover art cache)."
            checked={covers}
            onChange={setCovers}
          />
          <SettingsToggle
            label="Animated video backdrops"
            desc="Songs with a background clip on the server play it behind the fullscreen player. Each clip is downloaded once and kept on this device, up to the limit in Storage → Cache size limits."
            checked={backdrops}
            onChange={setBackdrops}
          />
          <SettingsToggle
            label="Pause video when Psysonic is not focused"
            desc="The backdrop video stops while you are in another window, like the visualizer, and goes on when you come back. Saves GPU and battery."
            checked={pauseUnfocused}
            onChange={setPauseUnfocused}
          />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 13, alignSelf: 'flex-start' }}
            onClick={async () => {
              await clearBackgroundClips();
              refreshSize();
            }}
          >
            <Trash2 size={14} /> Clear video backdrops ({(size / 1024 / 1024).toFixed(0)} MB)
          </button>
        </SettingsGroup>
      </div>
    </SettingsSubSection>
  );
}
