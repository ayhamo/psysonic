import { GitFork } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { ForkSongClipsControls } from '@/features/settings/components/ForkSongClipsControls';
import { ForkCacheLimitsControls } from '@/features/settings/components/ForkCacheLimitsSection';
import { ForkOfflineSize } from '@/features/settings/components/ForkOfflineSize';

/** Fork changes that have no switch; listed so it is clear what differs from upstream. */
const ALWAYS_ON = [
  'Every song shows its own embedded cover (player bar, Now Playing, queue, track lists, fullscreen), not the album cover.',
  'Classic crossfade also fades when you press Next or Previous.',
  'Synced lyrics stay in time after a crossfade.',
  'Big albums open faster (rows outside the view are not drawn).',
  'Click # in an album’s track list to reverse its order; remembered per album, and Play, Add to queue and clicking a song follow it.',
  'Fullscreen background: the song’s cover at its own size while fanart is looked up or when there is none; Navidrome’s grey star placeholder is never shown.',
  'Fanart: a combined artist ("A X B") falls back to the first artist; an artist without fanart is asked again after a week; the next song’s artist is looked up ahead.',
  'Discord: the Apple cover search also tries the first artist with each part of the title, and "External sources only" always searches Apple.',
  'Visualizer runs at 30 fps unless you change it.',
  'Installers left by past updates are deleted on start; updates come from this fork.',
];

/**
 * Fork patch: every setting this fork adds, in one place (Integrations), so it is
 * clear which settings are not upstream's. The storage ones also stay in Storage;
 * both places use the same stores, so they always show the same values.
 */
export function ForkSettingsSection() {
  const mediaDir = useAuthStore(s => s.mediaDir) || null;
  return (
    <SettingsSubSection
      title="Fork settings"
      icon={<GitFork size={16} />}
      description="Settings added by this fork, and what it changes without a switch. The storage ones also appear in Storage and stay in sync."
      searchText="fork settings animated covers video backdrops canvas clips pause focus cache size limit browser cache offline songs"
    >
      <div className="settings-card">
        <div className="settings-group-title">Animated covers and video backdrops</div>
        <ForkSongClipsControls />
      </div>
      <div className="settings-card">
        <div className="settings-group-title">Cache size limits</div>
        <ForkCacheLimitsControls />
        <ForkOfflineSize mediaDir={mediaDir} />
      </div>
      <div className="settings-card">
        <div className="settings-group-title">Always on in this fork (no switch)</div>
        <SettingsGroup>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {ALWAYS_ON.map(line => <li key={line}>{line}</li>)}
          </ul>
        </SettingsGroup>
      </div>
    </SettingsSubSection>
  );
}
