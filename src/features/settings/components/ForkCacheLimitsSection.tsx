import { useEffect, useRef, useState } from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { formatBytes } from '@/lib/format/formatBytes';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isTauri } from '@tauri-apps/api/core';
import { commands } from '@/generated/bindings';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsSubCard, SettingsField } from '@/features/settings/components/SettingsSubCard';

/**
 * Fork patch: size limits for the cover cache and the background clips
 * (the hot cache has its own limit above). Rust keeps the values in
 * fork-settings.json and applies them (src-tauri/src/fork_startup.rs).
 * English only, like the rest of the fork.
 */
const useCacheLimits = create<{ coverMb: number; clipsMb: number; set: (v: Partial<{ coverMb: number; clipsMb: number }>) => void }>()(
  persist(
    set => ({ coverMb: 0, clipsMb: 600, set: v => set(v) }),
    { name: 'psysonic_fork_cache_limits' },
  ),
);

const clampMb = (v: number, min: number) => (Number.isFinite(v) ? Math.min(100_000, Math.max(min, Math.round(v))) : min);

/** Typing only edits the field; the value is saved on blur or Enter (a half-typed "6" must not delete clips). */
function MbInput({ value, min, onCommit, label }: { value: number; min: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const next = draft.trim() === '' ? value : clampMb(Number(draft), min);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="input"
      type="number"
      min={min}
      step={50}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ width: 96, padding: '6px 10px', fontSize: 13 }}
      aria-label={label}
    />
  );
}

export function ForkCacheLimitsSection() {
  const { coverMb, clipsMb, set } = useCacheLimits();
  const first = useRef(true);
  const [browserBytes, setBrowserBytes] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void commands.forkWebviewCacheSize().then(r => setBrowserBytes(r.status === 'ok' ? r.data : 0));
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // only save real changes
    const handle = window.setTimeout(() => {
      if (isTauri()) void commands.forkSetCacheLimits(coverMb, Math.max(50, clipsMb)).catch(() => {});
    }, 600);
    return () => window.clearTimeout(handle);
  }, [coverMb, clipsMb]);

  const input = (value: number, min: number, onChange: (v: number) => void, label: string) => (
    <MbInput key={value} value={value} min={min} onCommit={onChange} label={label} />
  );

  return (
    <SettingsSubSection title="Cache size limits" icon={<HardDrive size={16} />} searchText="cache size limit cover video backdrop clips disk space">
      <div className="settings-card">
        <SettingsGroup desc="The hot cache limit is set above. When a cache is full, what was used longest ago is removed first; offline songs are never removed.">
          <SettingsSubCard>
            <SettingsField row label="Cover art cache (MB, 0 = no limit)" desc="Checked when Psysonic starts.">
              {input(coverMb, 0, v => set({ coverMb: v }), 'Cover art cache limit in MB')}
            </SettingsField>
            <SettingsField
              label={`Browser cache: ${browserBytes !== null ? formatBytes(browserBytes) : '…'}`}
              desc="The app window's own web cache. Clearing it keeps your settings; Psysonic restarts, and covers it had cached load from the server again."
            >
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 13, alignSelf: 'flex-start' }}
                disabled={!isTauri()}
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    window.setTimeout(() => setConfirmClear(false), 4000); // the second click must follow soon
                    return;
                  }
                  void commands.forkClearWebviewCache().catch(() => {});
                }}
              >
                <Trash2 size={14} /> {confirmClear ? 'Click again to restart and clear' : 'Clear browser cache'}
              </button>
            </SettingsField>
            <SettingsField row label="Video backdrops (MB, at least 50)" desc="Applied right away. All 247 clips take about 490 MB.">
              {input(clipsMb, 50, v => set({ clipsMb: v }), 'Video backdrops limit in MB')}
            </SettingsField>
          </SettingsSubCard>
        </SettingsGroup>
      </div>
    </SettingsSubSection>
  );
}
