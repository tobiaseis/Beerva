import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { PubCrawlRouteMap } from './PubCrawlRouteMap';
import { CachedImage } from './CachedImage';
import { buildPubCrawlMediaSlides, PubCrawl } from '../lib/pubCrawls';
import { colors } from '../theme/colors';
import { spacing } from '../theme/layout';

const FEED_CONTENT_MAX_WIDTH = 680;
const FEED_HORIZONTAL_PADDING = Platform.OS === 'web' ? 14 : 16;
const MIN_SLIDE_WIDTH = 260;

type Props = {
  crawl: PubCrawl;
};

export const PubCrawlMediaCarousel = ({ crawl, onImagePress }: Props & { onImagePress?: (url: string) => void }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const slideWidth = useMemo(() => {
    const feedWidth = Math.min(windowWidth - (FEED_HORIZONTAL_PADDING * 2), FEED_CONTENT_MAX_WIDTH);
    return Math.max(MIN_SLIDE_WIDTH, feedWidth - (spacing.md * 2));
  }, [windowWidth]);
  const slideHeight = Math.round(slideWidth * 0.75);
  const slides = useMemo(() => buildPubCrawlMediaSlides(crawl.stops), [crawl.stops]);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / slideWidth);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  return (
    <View style={[styles.container, { height: slideHeight }]}>
      <ScrollView
        style={styles.scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        snapToInterval={slideWidth}
        decelerationRate="fast"
      >
        {slides.map((slide) => (
          <View key={slide.id} style={[styles.slide, { width: slideWidth, height: slideHeight }]}>
            {slide.type === 'map' ? (
              <PubCrawlRouteMap stops={crawl.stops} width={slideWidth} height={slideHeight} />
            ) : (
              <TouchableOpacity
                style={styles.photoPressable}
                activeOpacity={0.9}
                onPress={() => onImagePress?.(slide.imageUrl)}
              >
                <CachedImage
                  uri={slide.imageUrl}
                  style={styles.image}
                  recyclingKey={`crawl-${crawl.id}-${slide.id}-${slide.imageUrl}`}
                  accessibilityLabel={`${slide.pubName} pub crawl photo`}
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
    position: 'relative',
    overflow: 'hidden',
  },
  scroller: {
    width: '100%',
    height: '100%',
  },
  slide: {
    backgroundColor: colors.cardMuted,
  },
  photoPressable: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
