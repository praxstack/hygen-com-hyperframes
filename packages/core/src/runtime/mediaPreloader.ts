import { refreshRuntimeMediaCache, type RuntimeMediaClip } from "./media";

const LAZY_THRESHOLD = 6;
const LOOKAHEAD_SECONDS = 10;
const LOOKAHEAD_MIN_CLIPS = 2;

export interface MediaPreloadManager {
  refresh(): void;
  sync(currentTimeSeconds: number): void;
  preloadAroundTime(timeSeconds: number): void;
  isLazy(): boolean;
}

export function createMediaPreloadManager(options?: {
  resolveStartSeconds?: (element: Element) => number;
  resolveDurationSeconds?: (element: HTMLVideoElement | HTMLAudioElement) => number | null;
  shouldIncludeElement?: (element: HTMLVideoElement | HTMLAudioElement) => boolean;
}): MediaPreloadManager {
  let clips: RuntimeMediaClip[] = [];
  const promoted = new WeakSet<HTMLMediaElement>();
  let lazy = false;

  function refresh(): void {
    const cache = refreshRuntimeMediaCache(options);
    clips = cache.mediaClips;
    lazy = clips.length >= LAZY_THRESHOLD;
  }

  function promoteClip(clip: RuntimeMediaClip): void {
    if (promoted.has(clip.el)) return;
    promoted.add(clip.el);
    if (clip.el.preload !== "auto") {
      clip.el.preload = "auto";
    }
    if (clip.el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      clip.el.load();
    }
  }

  function getClipsInWindow(timeSeconds: number): Set<RuntimeMediaClip> {
    const windowEnd = timeSeconds + LOOKAHEAD_SECONDS;
    const inWindow = new Set<RuntimeMediaClip>();

    for (const clip of clips) {
      const active = timeSeconds >= clip.start && timeSeconds < clip.end;
      const inLookahead = clip.start >= timeSeconds && clip.start <= windowEnd;
      if (active || inLookahead) {
        inWindow.add(clip);
      }
    }

    if (inWindow.size < LOOKAHEAD_MIN_CLIPS) {
      const sorted = clips
        .filter((c) => c.start >= timeSeconds && !inWindow.has(c))
        .sort((a, b) => a.start - b.start);
      for (const clip of sorted) {
        inWindow.add(clip);
        if (inWindow.size >= LOOKAHEAD_MIN_CLIPS) break;
      }
    }

    return inWindow;
  }

  function sync(currentTimeSeconds: number): void {
    if (!lazy) return;
    const window = getClipsInWindow(currentTimeSeconds);
    for (const clip of clips) {
      if (window.has(clip)) {
        promoteClip(clip);
      }
    }
  }

  function preloadAroundTime(timeSeconds: number): void {
    if (!lazy) return;
    const window = getClipsInWindow(timeSeconds);
    for (const clip of clips) {
      if (window.has(clip)) {
        promoteClip(clip);
      }
    }
  }

  function isLazy(): boolean {
    return lazy;
  }

  return { refresh, sync, preloadAroundTime, isLazy };
}
