import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Web only: makes `env(safe-area-inset-*)` work on notched iPhones (viewport-fit=cover),
 * blocks page zoom/scroll gestures and sets a dark page background.
 */
export function useWebViewport(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = globalThis.document;
    let meta = doc.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = doc.createElement('meta');
      meta.setAttribute('name', 'viewport');
      doc.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );
    doc.body.style.overscrollBehavior = 'none';
    doc.body.style.touchAction = 'manipulation';
    doc.body.style.backgroundColor = '#0b1d1a';
  }, []);
}
