import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';

import { FakeBeerVisual } from './FakeBeerVisual';

type FakeBeerUnlockOverlayProps = {
  visible: boolean;
  onFilled: () => void;
};

const FAKE_BEER_UNLOCK_FILL_MS = 950;

export const FakeBeerUnlockOverlay = ({ visible, onFilled }: FakeBeerUnlockOverlayProps) => {
  const { height } = useWindowDimensions();
  const fillProgress = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (!visible) {
      setRendered(false);
      fillProgress.setValue(0);
      return;
    }

    setRendered(true);
    fillProgress.setValue(0);
    Animated.timing(fillProgress, {
      toValue: 1,
      duration: FAKE_BEER_UNLOCK_FILL_MS,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        onFilled();
      }
    });
  }, [fillProgress, onFilled, visible]);

  if (!rendered) return null;

  const overlayOpacity = fillProgress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 1, 1],
  });
  const feedFade = fillProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.62],
  });
  const fillHeight = fillProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });

  return (
    <Animated.View pointerEvents="auto" style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View style={[styles.feedDim, { opacity: feedFade }]} />
      <Animated.View style={[styles.risingBeer, { height: fillHeight }]}>
        <View style={{ height }}>
          <FakeBeerVisual fillLevel={1} tiltDegrees={0} />
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
  },
  feedDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
  },
  risingBeer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
