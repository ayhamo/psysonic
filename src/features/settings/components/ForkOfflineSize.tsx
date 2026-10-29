import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getMediaTierSize } from '@/lib/api/syncfs';
import { formatBytes } from '@/lib/format/formatBytes';

/** Fork patch: size of the offline songs under the media folder. Clearing caches never touches them. */
export function ForkOfflineSize({ mediaDir }: { mediaDir: string | null }) {
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    Promise.resolve()
      .then(() => getMediaTierSize({ tier: 'library', mediaDir }))
      .then(b => { if (alive) setBytes(b); })
      .catch(() => { if (alive) setBytes(0); });
    return () => { alive = false; };
  }, [mediaDir]);
  return (
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
      Offline songs: {bytes !== null ? formatBytes(bytes) : '…'} (in library/, never removed by clearing a cache)
    </div>
  );
}
