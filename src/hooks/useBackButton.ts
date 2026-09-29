import { useEffect } from 'react';
import { BackHandler, BackPressHandler } from '../lib/backHandler';

/**
 * Hook to attach an Android back button / gesture listener.
 * When `enabled` is true, pressing back calls `handler`.
 * If `handler` returns `true`, the back press is consumed (e.g. closing a modal/drawer).
 * If `handler` returns `false` or void, the next handler in stack or exit prompt is triggered.
 */
export function useBackButton(handler: BackPressHandler, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => {
      subscription.remove();
    };
  }, [handler, enabled]);
}
