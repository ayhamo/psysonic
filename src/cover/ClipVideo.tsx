import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/features/playback';
import { forgetBackgroundClip, useSongClipsStore } from '@/cover/songClips';

const windowActive = () => !document.hidden && document.hasFocus();

/** True while the window is visible and focused. */
function useWindowActive(): boolean {
  const [active, setActive] = useState(windowActive);
  useEffect(() => {
    const update = () => setActive(windowActive());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return active;
}

/**
 * Fork patch: a muted looping clip laid over a cover or background (see
 * songClips.ts). It fades in once it actually plays, so a missing file just
 * leaves the picture underneath. It pauses while the music is paused and,
 * unless switched off, while the window is not focused.
 */
export function ClipVideo({ src, className = '' }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<{ src: string; playing: boolean }>({ src: '', playing: false });
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const pauseUnfocused = useSongClipsStore(s => s.pauseUnfocused);
  const windowIsActive = useWindowActive();
  const run = isPlaying && (windowIsActive || !pauseUnfocused);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (run) void v.play().catch(() => {});
    else v.pause();
  }, [run, src]);

  if (!src) return null;
  const shown = state.src === src && state.playing;
  return (
    <video
      key={src}
      ref={ref}
      className={`fork-clip${shown ? ' is-playing' : ''} ${className}`}
      src={src}
      autoPlay={run}
      muted
      loop
      playsInline
      aria-hidden="true"
      onPlaying={() => setState({ src, playing: true })}
      // shown once its first frame is ready, so switching it on while paused shows the still frame
      onLoadedData={() => setState({ src, playing: true })}
      onError={() => {
        setState({ src, playing: false });
        forgetBackgroundClip(src); // e.g. the file was removed by the size limit: ask again next time
      }}
    />
  );
}

/**
 * Fullscreen background clip. Spotify canvases are 9:16, so the clip is shown
 * whole at full height, over the song's blurred cover that fills the screen
 * (a still picture: a second blurred video would decode and blur every frame).
 */
export function ClipBackdrop({ src, fill }: { src: string; fill?: string }) {
  if (!src) return null;
  return (
    <div className="fork-clip-backdrop" aria-hidden="true">
      {fill && <img className="fork-clip-backdrop-fill" src={fill} alt="" draggable={false} />}
      <ClipVideo src={src} className="fork-clip-backdrop-main" />
    </div>
  );
}
