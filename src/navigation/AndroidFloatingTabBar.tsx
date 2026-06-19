import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { floatingTabBarMetrics, radius, shadows } from '../theme/layout';

export const AndroidFloatingTabBar = ({ descriptors, navigation, state }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(Math.max(viewportWidth - 32, 0), 520);
  const bottom = Math.max(insets.bottom + 12, floatingTabBarMetrics.nativeBottom);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom, width }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? colors.primary : colors.textMuted;
          const label = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;

          const handlePress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onPress={handlePress}
              style={({ pressed }) => [styles.tab, pressed ? styles.tabPressed : undefined]}
              testID={options.tabBarButtonTestID}
            >
              <View style={styles.iconSlot}>
                {options.tabBarIcon?.({ focused, color, size: 24 })}
                {options.tabBarBadge === undefined || options.tabBarBadge === null ? null : (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{options.tabBarBadge}</Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={[styles.label, { color }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    position: 'absolute',
    zIndex: 20,
  },
  pill: {
    ...shadows.raised,
    backgroundColor: '#172238',
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: floatingTabBarMetrics.nativeHeight,
    paddingBottom: 7,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  tabPressed: {
    opacity: 0.76,
  },
  iconSlot: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    position: 'relative',
    width: 24,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.background,
    borderRadius: 9,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -10,
    top: -8,
  },
  badgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
});
