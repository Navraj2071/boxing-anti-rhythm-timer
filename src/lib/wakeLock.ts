/**
 * Keeps the screen awake during a session where the Screen Wake Lock API is
 * available. Purely a progressive enhancement: failures are ignored.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  if (sentinel && !sentinel.released) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!wanted) {
      // Released while the request was pending.
      await lock.release();
      return;
    }
    sentinel = lock;
    lock.addEventListener("release", () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    /* denied, low battery, page hidden, etc. */
  }
}

export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  const lock = sentinel;
  sentinel = null;
  try {
    await lock?.release();
  } catch {
    /* ignore */
  }
}
