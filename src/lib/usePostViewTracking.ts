import { useEffect, useRef } from 'react';
import { AppState, ViewToken } from 'react-native';
import type { FeedItem } from './feedTypes';
import { getFeedItemViewTarget, POST_VIEWABILITY_CONFIG, postViewRecorder } from './postViews';

type ViewableItemsChangedInfo = {
  viewableItems: ViewToken[];
  changed: ViewToken[];
};

type UsePostViewTrackingArgs = {
  currentUserId: string | null;
  isActive: boolean;
};

export const usePostViewTracking = ({ currentUserId, isActive }: UsePostViewTrackingArgs) => {
  const currentUserIdRef = useRef(currentUserId);
  const isActiveRef = useRef(isActive);
  const appActiveRef = useRef(true);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) void postViewRecorder.flush();
  }, [isActive]);

  useEffect(() => {
    // react-native-web maps document visibility onto AppState, so this also
    // covers the PWA being hidden or closed.
    const subscription = AppState.addEventListener('change', (nextState) => {
      appActiveRef.current = nextState === 'active';
      if (!appActiveRef.current) void postViewRecorder.flush();
    });
    return () => {
      subscription.remove();
      void postViewRecorder.flush();
    };
  }, []);

  // FlatList and FlashList throw if this callback's identity changes after
  // mount, so it is created once and reads the latest state through refs.
  const onViewableItemsChanged = useRef(({ changed }: ViewableItemsChangedInfo) => {
    if (!isActiveRef.current || !appActiveRef.current) return;
    changed.forEach((token) => {
      if (!token.isViewable) return;
      const target = getFeedItemViewTarget(token.item as FeedItem, currentUserIdRef.current);
      if (target) postViewRecorder.markSeen(target);
    });
  }).current;

  return { viewabilityConfig: POST_VIEWABILITY_CONFIG, onViewableItemsChanged };
};
