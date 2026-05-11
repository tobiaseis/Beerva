import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { X } from 'lucide-react-native';
import { CachedImage } from './CachedImage';
import { colors } from '../theme/colors';

type Props = {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
};

export const ImageViewerModal = ({ visible, imageUrl, onClose }: Props) => {
  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X color="#ffffff" size={28} />
          </TouchableOpacity>
        </View>
        <View style={styles.imageContainer}>
          <CachedImage
            uri={imageUrl}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    zIndex: 10,
  },
  closeButton: {
    padding: 8,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
