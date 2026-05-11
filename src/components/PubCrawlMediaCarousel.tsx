import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, Platform, TouchableOpacity } from 'react-native';
import { PubCrawlRouteMap } from './PubCrawlRouteMap';
import { CachedImage } from './CachedImage';
import { PubCrawl } from '../lib/pubCrawls';
import { colors } from '../theme/colors';

const WINDOW_WIDTH = Dimensions.get('window').width;
const CARD_MARGIN = 20;
const SLIDE_WIDTH = Platform.OS === 'web' ? 480 : WINDOW_WIDTH - (CARD_MARGIN * 2);

type Props = {
  crawl: PubCrawl;
};

export const PubCrawlMediaCarousel = ({ crawl, onImagePress }: Props & { onImagePress?: (url: string) => void }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = [
    { type: 'map', id: 'map' },
    ...crawl.stops
      .filter(stop => stop.imageUrl)
      .map(stop => ({
        type: 'photo',
        id: `photo-${stop.id}`,
        imageUrl: stop.imageUrl as string,
      }))
  ];

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SLIDE_WIDTH);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        snapToInterval={SLIDE_WIDTH}
        decelerationRate="fast"
      >
        {slides.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            {slide.type === 'map' ? (
              <PubCrawlRouteMap stops={crawl.stops} width={SLIDE_WIDTH} height={SLIDE_WIDTH * 0.75} />
            ) : (
              <TouchableOpacity activeOpacity={0.9} onPress={() => onImagePress?.((slide as any).imageUrl)}>
                <CachedImage
                  uri={(slide as any).imageUrl}
                  style={styles.image}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.indicatorContainer}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                index === activeIndex ? styles.dotActive : null
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_WIDTH * 0.75,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSoft,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
