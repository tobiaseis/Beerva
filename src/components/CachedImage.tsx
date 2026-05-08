import React from 'react';
import { StyleProp, StyleSheet, View } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';

import { colors } from '../theme/colors';

type CachedImageProps = {
  uri?: string | null;
  fallbackUri?: string;
  style?: StyleProp<any>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  accessibilityLabel?: string;
};

export const CachedImage = React.memo(({
  uri,
  fallbackUri,
  style,
  contentFit = 'cover',
  recyclingKey,
  accessibilityLabel,
}: CachedImageProps) => {
  const sourceUri = uri || fallbackUri;

  if (!sourceUri) {
    return <View style={[styles.placeholder, style]} />;
  }

  return (
    <Image
      source={{ uri: sourceUri }}
      style={[styles.image, style]}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={120}
      recyclingKey={recyclingKey || sourceUri}
      accessibilityLabel={accessibilityLabel}
    />
  );
});

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.background,
  },
  placeholder: {
    backgroundColor: colors.background,
  },
});
