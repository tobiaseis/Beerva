import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ImageOff, RefreshCw, X } from 'lucide-react-native';

import { getLiveMateDisplayName } from '../lib/liveMateSessions';
import type { LiveMateSession } from '../lib/liveMateSessions';
import { getVisibleSessionPhotoUrls } from '../lib/sessionPhotos';
import type { SessionPhoto } from '../lib/sessionPhotos';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';

const MAX_MODAL_WIDTH = 540;
const HORIZONTAL_MARGIN = 24;

type LiveSessionPhotoPreviewModalProps = {
  visible: boolean;
  session: LiveMateSession | null;
  photos: SessionPhoto[];
  loading: boolean;
  error: string | null;
  unavailable: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export const LiveSessionPhotoPreviewModal = ({
  visible,
  session,
  photos,
  loading,
  error,
  unavailable,
  onRetry,
  onClose,
}: LiveSessionPhotoPreviewModalProps) => {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const displayName = getLiveMateDisplayName(session || { username: null });
  const photoUrls = useMemo(() => getVisibleSessionPhotoUrls(photos, null), [photos]);
  const modalWidth = Math.min(windowWidth - HORIZONTAL_MARGIN * 2, MAX_MODAL_WIDTH);
  const slideWidth = Math.max(260, modalWidth - 32);
  const slideHeight = Math.round(slideWidth * 1.12);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [session?.sessionId, photoUrls.join('|')]);

  const handlePhotoScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / slideWidth);
    const clampedIndex = Math.max(0, Math.min(index, photoUrls.length - 1));
    setActivePhotoIndex((currentIndex) => currentIndex === clampedIndex ? currentIndex : clampedIndex);
  };

  const renderContent = () => {
    if (unavailable) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>This session is no longer live.</Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.stateText}>Loading photos...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>Could not load photos.</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Try again loading live session photos"
          >
            <RefreshCw color={colors.background} size={16} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (photoUrls.length === 0) {
      return (
        <View style={styles.stateBlock}>
          <ImageOff color={colors.textMuted} size={30} />
          <Text style={styles.stateTitle}>No photos yet.</Text>
        </View>
      );
    }

    return (
      <View style={[styles.carouselWrap, { height: slideHeight }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handlePhotoScroll}
          onMomentumScrollEnd={handlePhotoScroll}
          scrollEventThrottle={16}
          snapToInterval={slideWidth}
          decelerationRate="fast"
          style={styles.scroller}
        >
          {photoUrls.map((imageUrl, index) => (
            <View
              key={`${session?.sessionId || 'live'}-${imageUrl}`}
              style={[styles.slide, { width: slideWidth, height: slideHeight }]}
            >
              <CachedImage
                uri={imageUrl}
                style={styles.image}
                recyclingKey={`live-preview-${session?.sessionId || 'unknown'}-${index}-${imageUrl}`}
                accessibilityLabel={`${displayName}'s live session photo ${index + 1}`}
              />
            </View>
          ))}
        </ScrollView>
        {photoUrls.length > 1 ? (
          <View pointerEvents="none" style={styles.dots}>
            {photoUrls.map((imageUrl, index) => (
              <View
                key={`dot-${imageUrl}`}
                style={[styles.dot, index === activePhotoIndex ? styles.dotActive : null]}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, { width: modalWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Live preview</Text>
              <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close live session photo preview"
            >
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.66)',
  },
  card: {
    maxHeight: '86%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stateBlock: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  stateTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  carouselWrap: {
    position: 'relative',
    backgroundColor: colors.cardMuted,
  },
  scroller: {
    width: '100%',
    height: '100%',
  },
  slide: {
    backgroundColor: colors.cardMuted,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.cardMuted,
  },
  dots: {
    position: 'absolute',
    bottom: 12,
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
    backgroundColor: 'rgba(248, 250, 252, 0.52)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
