import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Minus, Plus, RotateCcw, X } from 'lucide-react-native';

import {
  AvatarCropRect,
  clampAvatarZoom,
  getAvatarCropLayout,
  getAvatarCropRect,
  MAX_AVATAR_CROP_ZOOM,
  MIN_AVATAR_CROP_ZOOM,
} from '../lib/avatarCrop';
import { imageFromPickerAsset, SelectedImage, UPLOAD_IMAGE_MAX_WIDTH } from '../lib/imageUpload';
import { colors } from '../theme/colors';
import { spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { AppButton } from './AppButton';

type AvatarCropModalProps = {
  visible: boolean;
  asset: ImagePickerAsset | null;
  title?: string;
  onCancel: () => void;
  onConfirm: (image: SelectedImage) => void;
};

type ControlButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  children: React.ReactNode;
  onPress: () => void;
};

const ZOOM_STEP = 0.18;
const PAN_STEP = 18;
const OUTPUT_QUALITY = 0.74;

const cropAvatarOnWeb = async (
  asset: ImagePickerAsset,
  cropRect: AvatarCropRect
): Promise<SelectedImage> => {
  const source = imageFromPickerAsset(asset);
  let sourceBlob = source.blob || source.file;

  if (!sourceBlob) {
    const response = await fetch(source.uri);
    if (!response.ok) {
      throw new Error('Could not read the selected image.');
    }
    sourceBlob = await response.blob();
  }

  if (typeof document === 'undefined') {
    return {
      ...source,
      blob: sourceBlob,
      mimeType: sourceBlob.type || source.mimeType || 'image/jpeg',
    };
  }

  const objectUrl = URL.createObjectURL(sourceBlob);

  try {
    const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const sourceWidth = Math.max(1, asset.width || imageElement.naturalWidth);
    const sourceHeight = Math.max(1, asset.height || imageElement.naturalHeight);
    const scaleX = imageElement.naturalWidth / sourceWidth;
    const scaleY = imageElement.naturalHeight / sourceHeight;
    const canvas = document.createElement('canvas');
    canvas.width = UPLOAD_IMAGE_MAX_WIDTH;
    canvas.height = UPLOAD_IMAGE_MAX_WIDTH;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not crop image.');

    context.drawImage(
      imageElement,
      cropRect.originX * scaleX,
      cropRect.originY * scaleY,
      cropRect.width * scaleX,
      cropRect.height * scaleY,
      0,
      0,
      UPLOAD_IMAGE_MAX_WIDTH,
      UPLOAD_IMAGE_MAX_WIDTH
    );

    const croppedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', OUTPUT_QUALITY);
    });

    if (!croppedBlob) throw new Error('Could not crop image.');

    return {
      uri: URL.createObjectURL(croppedBlob),
      blob: croppedBlob,
      mimeType: 'image/jpeg',
      fileName: `${source.fileName?.replace(/\.[^.]+$/, '') || 'avatar'}.jpg`,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const cropAvatarOnNative = async (
  asset: ImagePickerAsset,
  cropRect: AvatarCropRect
): Promise<SelectedImage> => {
  const ImageManipulator = await import('expo-image-manipulator');
  const manipResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    [
      {
        crop: {
          originX: cropRect.originX,
          originY: cropRect.originY,
          width: cropRect.width,
          height: cropRect.height,
        },
      },
      { resize: { width: UPLOAD_IMAGE_MAX_WIDTH, height: UPLOAD_IMAGE_MAX_WIDTH } },
    ],
    { compress: OUTPUT_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    uri: manipResult.uri,
    mimeType: 'image/jpeg',
    fileName: `${asset.fileName?.replace(/\.[^.]+$/, '') || 'avatar'}.jpg`,
  };
};

const cropAvatarImage = async (
  asset: ImagePickerAsset,
  cropRect: AvatarCropRect
): Promise<SelectedImage> => {
  if (Platform.OS === 'web') {
    return cropAvatarOnWeb(asset, cropRect);
  }

  return cropAvatarOnNative(asset, cropRect);
};

const ControlButton = ({ accessibilityLabel, disabled = false, children, onPress }: ControlButtonProps) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    activeOpacity={0.74}
    disabled={disabled}
    onPress={onPress}
    style={[styles.controlButton, disabled ? styles.controlButtonDisabled : null]}
  >
    {children}
  </TouchableOpacity>
);

export const AvatarCropModal = ({
  visible,
  asset,
  title = 'Adjust Photo',
  onCancel,
  onConfirm,
}: AvatarCropModalProps) => {
  const { width } = useWindowDimensions();
  const frameSize = Math.max(180, Math.min(320, width - 48));
  const sourceWidth = Math.max(1, asset?.width || frameSize);
  const sourceHeight = Math.max(1, asset?.height || frameSize);
  const [zoom, setZoom] = useState(MIN_AVATAR_CROP_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const layout = getAvatarCropLayout({
    sourceWidth,
    sourceHeight,
    frameSize,
    zoom,
    offsetX: offset.x,
    offsetY: offset.y,
  });

  useEffect(() => {
    setZoom(MIN_AVATAR_CROP_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, [asset?.uri]);

  const clampOffset = (nextOffset: { x: number; y: number }, nextZoom = zoom) => {
    const nextLayout = getAvatarCropLayout({
      sourceWidth,
      sourceHeight,
      frameSize,
      zoom: nextZoom,
      offsetX: nextOffset.x,
      offsetY: nextOffset.y,
    });

    return { x: nextLayout.offsetX, y: nextLayout.offsetY };
  };

  const applyZoom = (nextZoom: number) => {
    const safeZoom = clampAvatarZoom(nextZoom);
    setZoom(safeZoom);
    setOffset((current) => clampOffset(current, safeZoom));
  };

  const nudge = (deltaX: number, deltaY: number) => {
    setOffset((current) => clampOffset({ x: current.x + deltaX, y: current.y + deltaY }));
  };

  const resetCrop = () => {
    setZoom(MIN_AVATAR_CROP_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
    },
    onPanResponderGrant: () => {
      dragStart.current = { x: layout.offsetX, y: layout.offsetY };
    },
    onPanResponderMove: (_, gestureState) => {
      setOffset(clampOffset({
        x: dragStart.current.x + gestureState.dx,
        y: dragStart.current.y + gestureState.dy,
      }));
    },
  }), [frameSize, layout.offsetX, layout.offsetY, sourceHeight, sourceWidth, zoom]);

  const confirmCrop = async () => {
    if (!asset || processing) return;

    setProcessing(true);
    try {
      const cropRect = getAvatarCropRect({
        sourceWidth,
        sourceHeight,
        frameSize,
        zoom,
        offsetX: layout.offsetX,
        offsetY: layout.offsetY,
      });
      const croppedImage = await cropAvatarImage(asset, cropRect);
      onConfirm(croppedImage);
    } catch (error) {
      console.error('Avatar crop error:', error);
      Alert.alert('Could not crop photo', 'Try another photo or choose this one again.');
    } finally {
      setProcessing(false);
    }
  };

  const zoomProgress = `${((layout.zoom - MIN_AVATAR_CROP_ZOOM) / (MAX_AVATAR_CROP_ZOOM - MIN_AVATAR_CROP_ZOOM)) * 100}%`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close avatar crop"
            activeOpacity={0.72}
            onPress={onCancel}
            style={styles.closeButton}
          >
            <X color={colors.text} size={22} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View
            {...panResponder.panHandlers}
            style={[
              styles.cropFrame,
              { width: frameSize, height: frameSize, borderRadius: frameSize / 2 },
            ]}
          >
            {asset ? (
              <Image
                source={{ uri: asset.uri }}
                resizeMode="stretch"
                style={[
                  styles.cropImage,
                  {
                    width: layout.imageWidth,
                    height: layout.imageHeight,
                    left: layout.imageLeft,
                    top: layout.imageTop,
                  },
                ]}
              />
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
            <View
              pointerEvents="none"
              style={[
                styles.cropRing,
                { width: frameSize, height: frameSize, borderRadius: frameSize / 2 },
              ]}
            />
          </View>

          <View style={styles.controls}>
            <View style={styles.zoomControls}>
              <ControlButton
                accessibilityLabel="Zoom photo out"
                disabled={layout.zoom <= MIN_AVATAR_CROP_ZOOM}
                onPress={() => applyZoom(layout.zoom - ZOOM_STEP)}
              >
                <Minus color={colors.text} size={20} />
              </ControlButton>
              <View style={styles.zoomTrack}>
                <View style={[styles.zoomFill, { width: zoomProgress as any }]} />
              </View>
              <ControlButton
                accessibilityLabel="Zoom photo in"
                disabled={layout.zoom >= MAX_AVATAR_CROP_ZOOM}
                onPress={() => applyZoom(layout.zoom + ZOOM_STEP)}
              >
                <Plus color={colors.text} size={20} />
              </ControlButton>
            </View>

            <View style={styles.panControls}>
              <ControlButton accessibilityLabel="Move photo up" onPress={() => nudge(0, -PAN_STEP)}>
                <ArrowUp color={colors.text} size={20} />
              </ControlButton>
              <View style={styles.panMiddleRow}>
                <ControlButton accessibilityLabel="Move photo left" onPress={() => nudge(-PAN_STEP, 0)}>
                  <ArrowLeft color={colors.text} size={20} />
                </ControlButton>
                <ControlButton accessibilityLabel="Reset photo crop" onPress={resetCrop}>
                  <RotateCcw color={colors.primary} size={20} />
                </ControlButton>
                <ControlButton accessibilityLabel="Move photo right" onPress={() => nudge(PAN_STEP, 0)}>
                  <ArrowRight color={colors.text} size={20} />
                </ControlButton>
              </View>
              <ControlButton accessibilityLabel="Move photo down" onPress={() => nudge(0, PAN_STEP)}>
                <ArrowDown color={colors.text} size={20} />
              </ControlButton>
            </View>
          </View>

          <View style={styles.actions}>
            <AppButton label="Cancel" variant="secondary" onPress={onCancel} style={styles.actionButton} />
            <AppButton
              label="Use Photo"
              icon={<Check color={colors.background} size={19} />}
              onPress={confirmCrop}
              loading={processing}
              disabled={!asset}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: Platform.OS === 'web' ? 68 : 96,
    paddingTop: Platform.OS === 'web' ? 18 : 48,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h2,
    fontSize: 22,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  cropFrame: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  cropImage: {
    position: 'absolute',
  },
  cropRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  controls: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.lg,
    alignItems: 'center',
  },
  zoomControls: {
    width: '100%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  zoomTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  zoomFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  panControls: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  panMiddleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  controlButtonDisabled: {
    opacity: 0.44,
  },
  actions: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
