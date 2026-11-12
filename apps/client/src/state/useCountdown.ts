import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (epoch ms), ticking every 250 ms; 0 once it has passed. */
export function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** `75` -> `1:15`. */
export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
