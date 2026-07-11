import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatingTabBarMetrics } from './layout';

export const usePwaParityInsets = () => {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const tabBarBottom = isWeb
    ? floatingTabBarMetrics.webBottom
    : insets.bottom + floatingTabBarMetrics.nativeGap;

  return {
    feedHeaderPaddingTop: isWeb ? 12 : insets.top + 12,
    screenTopBarPaddingTop: isWeb ? 18 : insets.top + 18,
    profileHeaderPaddingTop: isWeb ? 22 : insets.top + 22,
    modalHeaderPaddingTop: isWeb ? 20 : insets.top + 20,
    tabBarBottom,
    tabContentPaddingBottom: floatingTabBarMetrics.nativeHeight
      + tabBarBottom
      + floatingTabBarMetrics.contentGap,
  };
};
