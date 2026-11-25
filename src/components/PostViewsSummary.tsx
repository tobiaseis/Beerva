import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Eye } from 'lucide-react-native';
import { formatSeenByLabel } from '../lib/postViews';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  count: number;
  onPress: () => void;
};

export const PostViewsSummary = React.memo(({ count, onPress }: Props) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={0.72}
    accessibilityRole="button"
    accessibilityLabel={`See who viewed your post. ${formatSeenByLabel(count)}`}
  >
    <View style={styles.iconSlot}>
      <Eye color={colors.textMuted} size={16} />
    </View>
    <Text style={styles.text} numberOfLines={1}>
      {formatSeenByLabel(count)}
    </Text>
  </TouchableOpacity>
));

PostViewsSummary.displayName = 'PostViewsSummary';

const styles = StyleSheet.create({
  row: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconSlot: {
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontWeight: '700',
  },
});
