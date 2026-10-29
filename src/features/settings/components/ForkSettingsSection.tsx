import { GitFork } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import { ForkSongClipsControls } from '@/features/settings/components/ForkSongClipsControls';
import { ForkCacheLimitsControls } from '@/features/settings/components/ForkCacheLimitsSection';
import { ForkOfflineSize } from '@/features/settings/components/ForkOfflineSize';

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
      description="Settings added by this fork. The storage ones also appear in Storage and stay in sync."
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
    </SettingsSubSection>
  );
}
