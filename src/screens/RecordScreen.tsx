import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, TextInput, Platform, Modal } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Camera, MapPin, Beer, Minus, Plus, MessageSquare, Images, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { imageFromPickerAsset, prepareWebImageFromPickerAsset, SelectedImage, uploadImageToBucket } from '../lib/imageUpload';
import { AutocompleteInput } from '../components/AutocompleteInput';
import { showAlert } from '../lib/dialogs';
import * as ImagePicker from 'expo-image-picker';

const DANISH_BEERS_DATA = [
  { name: 'Tuborg Grøn', abv: 4.6 }, { name: 'Tuborg Classic', abv: 4.6 }, { name: 'Carlsberg Pilsner', abv: 4.6 },
  { name: 'Carlsberg 1883', abv: 4.6 }, { name: 'Carlsberg Elephant', abv: 7.2 }, { name: 'Tuborg Guld', abv: 5.6 },
  { name: 'Tuborg Julebryg', abv: 5.6 }, { name: 'Tuborg Påskebryg', abv: 5.4 }, { name: 'Grimbergen Double Ambrée', abv: 6.5 },
  { name: 'Grimbergen Blonde', abv: 6.7 }, { name: 'Kronenbourg 1664 Blanc', abv: 5.0 }, { name: 'Jacobsen Brown Ale', abv: 6.0 },
  { name: 'Jacobsen Yakima IPA', abv: 6.5 }, { name: 'Jacobsen Saaz Blonde', abv: 7.1 }, { name: 'Albani Odense Pilsner', abv: 4.6 },
  { name: 'Albani Classic', abv: 4.6 }, { name: 'Albani Giraf Beer', abv: 7.3 }, { name: 'Royal Pilsner', abv: 4.6 },
  { name: 'Royal Classic', abv: 4.6 }, { name: 'Royal Export', abv: 5.4 }, { name: 'Royal Økologisk', abv: 4.8 },
  { name: 'Schiøtz Mørk Mumme', abv: 6.5 }, { name: 'Schiøtz Gylden IPA', abv: 5.9 }, { name: 'Ceres Top', abv: 4.6 },
  { name: 'Thor Pilsner', abv: 4.6 }, { name: 'Faxe Premium', abv: 5.0 }, { name: 'Faxe Kondi Booster', abv: 0.0 },
  { name: 'Harboe Pilsner', abv: 4.6 }, { name: 'Harboe Classic', abv: 4.6 }, { name: 'Harboe Bear Beer', abv: 7.7 },
  { name: 'Thisted Limfjordsporter', abv: 7.9 }, { name: 'Thisted Thy Pilsner', abv: 4.6 }, { name: 'Thisted Økologisk Humle', abv: 5.8 },
  { name: 'Skagen Bryghus Drachmann', abv: 5.0 }, { name: 'Skagen Bryghus Skawbo', abv: 5.5 }, { name: 'Fur Vulcano Classic', abv: 4.6 },
  { name: 'Fur Bock', abv: 7.6 }, { name: 'Fur IPA', abv: 6.2 }, { name: 'Nørrebro Bryghus New York Lager', abv: 5.2 },
  { name: 'Nørrebro Bryghus Bombay IPA', abv: 6.1 }, { name: 'Nørrebro Bryghus Ravnsborg Rød', abv: 5.5 },
  { name: 'Amager Bryghus Hr. Frederiksen', abv: 10.5 }, { name: 'Amager Bryghus Todd The Axe Man', abv: 6.5 },
  { name: 'Mikkeller Peter Pale and Mary', abv: 4.6 }, { name: 'Mikkeller Burst IPA', abv: 5.5 },
  { name: 'Mikkeller Visions Lager', abv: 4.5 }, { name: 'Mikkeller Beer Geek Breakfast', abv: 7.5 },
  { name: 'To Øl City Session IPA', abv: 4.5 }, { name: 'To Øl Whirl Domination', abv: 6.2 },
  { name: 'To Øl 45 Days Pilsner', abv: 4.7 }, { name: 'To Øl Gose to Hollywood', abv: 3.8 },
  { name: 'Svaneke Classic', abv: 4.6 }, { name: 'Svaneke Mørk Guld', abv: 5.7 }, { name: 'Svaneke Craft Pilsner', abv: 4.6 },
  { name: 'Svaneke Choco Stout', abv: 5.7 }, { name: 'Hornbeer Black Magic Woman', abv: 10.0 },
  { name: 'Hornbeer Happy Hoppy', abv: 6.5 }, { name: 'Braw Ale', abv: 5.5 }, { name: 'Ale No. 16 (Refsvindinge)', abv: 5.7 },
  { name: 'Mors Stout', abv: 5.7 }, { name: 'Hancock Høker Bajer', abv: 5.0 }, { name: 'Hancock Black Lager', abv: 5.0 },
  { name: 'Hancock Gambrinus', abv: 9.6 }, { name: 'Willemoes Ale', abv: 5.2 }, { name: 'Willemoes Stout', abv: 5.3 },
  { name: 'Skanderborg Bryghus', abv: 5.0 }, { name: 'Ebeltoft Gårdbryggeri Raw Power', abv: 8.5 },
  { name: 'Ebeltoft Wildflower IPA', abv: 5.9 }, { name: 'Bøgedal Bryghus', abv: 6.5 },
  { name: 'Herslev Bryghus Mark Hø', abv: 5.5 }, { name: 'Herslev Bryghus Pale Ale', abv: 5.9 },
  { name: 'Midtfyns Bryghus Imperial Stout', abv: 9.5 }, { name: 'Midtfyns Bryghus Double IPA', abv: 9.2 },
  { name: 'Ugly Duck Brewing Co. Miami Vice', abv: 4.7 }, { name: 'Ugly Duck Foxy Brown', abv: 5.8 },
  { name: 'Det Lille Bryggeri', abv: 6.0 }, { name: 'Bryggeriet Skands', abv: 5.2 },
  { name: 'Kissmeyer Pale Ale', abv: 5.5 }, { name: 'Kissmeyer Stockholm Syndrome', abv: 8.5 },
  { name: 'Krenkerup Pilsner', abv: 4.6 }, { name: 'Krenkerup Classic', abv: 4.6 }, { name: 'Krenkerup Stout', abv: 5.3 },
  { name: 'Syndikatet', abv: 6.0 }, { name: 'Munkebo Mikrobryg', abv: 5.5 }, { name: 'Fanø Bryghus', abv: 6.5 },
  { name: 'Gourmetbryggeriet', abv: 5.0 }, { name: 'Indslev Bryghus Svanehvit', abv: 5.2 }, { name: 'Indslev Sort Hvede', abv: 6.5 },
  { name: 'Braunstein', abv: 5.0 }, { name: 'Ørbæk Bryggeri Fynsk Forår', abv: 4.8 }, { name: 'Ørbæk Brown Ale', abv: 5.0 },
  { name: 'Ørbæk IPA', abv: 5.0 }, { name: 'Hvidovre Bryghus', abv: 5.0 }, { name: 'Randers Bryghus', abv: 5.0 },
  { name: 'Viborg Bryghus', abv: 5.0 }, { name: 'Grauballe Bryghus', abv: 5.0 }, { name: 'Halsnæs Bryghus', abv: 5.0 },
  { name: 'Bies Bryghus', abv: 5.0 }, { name: 'Aarhus Bryghus', abv: 5.0 }, { name: 'Aarhus Bryghus Black Monster', abv: 10.0 },
  { name: 'Aarhus Bryghus IPA', abv: 6.0 }, { name: 'Guinness', abv: 4.2 }, { name: 'Heineken', abv: 5.0 }
];

const DANISH_BEERS = DANISH_BEERS_DATA.map(b => b.name);
const VOLUMES = ['25cl', '33cl', 'Schooner', 'Pint', '50cl'];

export const RecordScreen = ({ navigation }: any) => {
  const [beer, setBeer] = useState('');
  const [pub, setPub] = useState('');
  const [pubOptions, setPubOptions] = useState<string[]>([]);
  
  const [volume, setVolume] = useState('Pint');
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState('');

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [photoChoiceVisible, setPhotoChoiceVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pub.length < 3) {
      setPubOptions([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(pub + ' pub')}&format=json&addressdetails=1&countrycodes=dk&limit=8`, {
          headers: { 'User-Agent': 'BeervaApp/1.0 (info@beerva.test)' }
        });
        const data = await response.json();
        
        if (!Array.isArray(data)) {
          console.warn('Nominatim returned unexpected format:', data);
          setPubOptions([]);
          return;
        }

        const pubs: string[] = data.map((item: any) => {
           const name = item.name || item.address?.pub || item.address?.bar || item.address?.restaurant;
           const city = item.address?.city || item.address?.town || item.address?.village || '';
           return name ? (city ? `${name}, ${city}` : name) : null;
        }).filter(Boolean);
        
        const uniquePubs = Array.from(new Set(pubs));
        setPubOptions(uniquePubs);
      } catch (e) {
        console.error('Nominatim error:', e);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [pub]);

  const handleImageAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      setSelectedImage(await prepareWebImageFromPickerAsset(asset));
      return;
    }

    const ImageManipulator = await import('expo-image-manipulator');
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    setSelectedImage({
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
    });
  };

  const chooseFromLibrary = async () => {
    setPhotoChoiceVisible(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1, // We will compress manually
    });

    if (!result.canceled && result.assets[0]) {
      await handleImageAsset(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    setPhotoChoiceVisible(false);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert('Camera access needed', 'Allow camera access to take a new session photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1, // We will compress manually
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets[0]) {
      await handleImageAsset(result.assets[0]);
      navigation.navigate('Record');
    }
  };

  const saveSession = async () => {
    if (!beer || !pub) {
      showAlert('Missing fields', 'Please enter where and what you are drinking!');
      return;
    }

    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in!');

      let uploadedUrl = null;
      if (selectedImage) {
        uploadedUrl = await uploadImageToBucket('session_images', selectedImage, 'session');
      }

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        const { error: profileCreateError } = await supabase.from('profiles').upsert({
          id: user.id,
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'beer_lover',
          avatar_url: user.user_metadata?.avatar_url || 'https://i.pravatar.cc/150?u=' + user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (profileCreateError) throw profileCreateError;
      }

      // Find ABV
      const beerMatch = DANISH_BEERS_DATA.find(b => b.name.toLowerCase() === beer.toLowerCase());
      const abv = beerMatch ? beerMatch.abv : 5.0; // Default to 5.0 if custom
      const trimmedComment = comment.trim();

      const sessionPayload = {
        user_id: user.id,
        pub_name: pub,
        beer_name: beer,
        volume,
        quantity,
        abv,
        comment: trimmedComment || null,
        image_url: uploadedUrl,
      };

      let { error } = await supabase.from('sessions').insert(sessionPayload);

      if (error && error.message?.toLowerCase().includes('comment')) {
        const { comment: _comment, ...payloadWithoutComment } = sessionPayload;
        const retry = await supabase.from('sessions').insert(payloadWithoutComment);
        error = retry.error;
      }

      if (error) throw error;

      setBeer('');
      setPub('');
      setVolume('Pint');
      setQuantity(1);
      setComment('');
      setSelectedImage(null);
      showAlert('Cheers!', 'Your pint has been recorded.');
      navigation.navigate('Feed');
    } catch (e: any) {
      console.error('Save session error:', e);
      showAlert('Could not save session', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled={true}
    >
      <View style={styles.header}>
        <Text style={typography.h2}>Record a Session</Text>
      </View>

      <View style={styles.content}>
        <AutocompleteInput
          value={pub}
          onChangeText={setPub}
          data={pubOptions.length > 0 ? pubOptions : [pub]}
          placeholder="Where are you drinking?"
          icon={<MapPin color={colors.textMuted} size={20} />}
        />

        <AutocompleteInput
          value={beer}
          onChangeText={setBeer}
          data={DANISH_BEERS}
          placeholder="What are you drinking?"
          icon={<Beer color={colors.textMuted} size={20} />}
        />

        <Text style={styles.sectionLabel}>Size</Text>
        <View style={styles.volumeRow}>
          {VOLUMES.map((v) => (
            <TouchableOpacity 
              key={v} 
              style={[styles.volumeButton, volume === v && styles.volumeButtonActive]}
              onPress={() => setVolume(v)}
            >
              <Text style={[styles.volumeText, volume === v && styles.volumeTextActive]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Quantity</Text>
        <View style={styles.quantityContainer}>
          <TouchableOpacity 
            style={styles.quantityBtn} 
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
          >
            <Minus color={colors.primary} size={24} />
          </TouchableOpacity>
          
          <Text style={styles.quantityText}>{quantity}</Text>

          <TouchableOpacity 
            style={styles.quantityBtn} 
            onPress={() => setQuantity(quantity + 1)}
          >
            <Plus color={colors.primary} size={24} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Comment</Text>
        <View style={styles.commentContainer}>
          <MessageSquare color={colors.textMuted} size={20} />
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add a tasting note, rating, or story..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={220}
            textAlignVertical="top"
          />
        </View>
        <Text style={styles.characterCount}>{comment.length}/220</Text>

        <TouchableOpacity style={styles.photoButton} onPress={() => setPhotoChoiceVisible(true)}>
          {selectedImage ? (
            <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
          ) : (
            <>
              <Camera color={colors.primary} size={24} />
              <Text style={styles.photoText}>Add Photo</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.submitButton} 
          onPress={saveSession}
          disabled={loading}
        >
          {loading ? (
             <ActivityIndicator color={colors.background} />
          ) : (
             <Text style={styles.submitText}>Save Session</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={photoChoiceVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceVisible(false)}
      >
        <View style={styles.photoChoiceBackdrop}>
          <View style={styles.photoChoiceSheet}>
            <View style={styles.photoChoiceHeader}>
              <Text style={styles.photoChoiceTitle}>Add Photo</Text>
              <TouchableOpacity
                style={styles.photoChoiceClose}
                onPress={() => setPhotoChoiceVisible(false)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={takePhoto} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Camera color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Take Photo</Text>
                <Text style={styles.photoChoiceHint}>Open camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoChoiceOption} onPress={chooseFromLibrary} activeOpacity={0.76}>
              <View style={styles.photoChoiceIcon}>
                <Images color={colors.primary} size={22} />
              </View>
              <View style={styles.photoChoiceText}>
                <Text style={styles.photoChoiceLabel}>Upload Photo</Text>
                <Text style={styles.photoChoiceHint}>Choose from library</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 18 : 60,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 14 : 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  content: {
    padding: Platform.OS === 'web' ? 16 : 20,
    zIndex: 1,
  },
  sectionLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: 8,
    marginTop: 8,
  },
  volumeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 10,
  },
  volumeButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    minHeight: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  volumeText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  volumeTextActive: {
    color: colors.background,
  },
  commentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    minHeight: 104,
    marginBottom: 8,
    gap: 12,
  },
  commentInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    minHeight: 72,
    padding: 0,
  },
  characterCount: {
    ...typography.caption,
    textAlign: 'right',
    marginBottom: 24,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
    marginBottom: 32,
  },
  quantityBtn: {
    padding: 12,
    backgroundColor: colors.glass,
    borderRadius: 8,
  },
  quantityText: {
    ...typography.h1,
    color: colors.text,
    width: 60,
    textAlign: 'center',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    height: Platform.OS === 'web' ? 132 : 150,
    marginBottom: 24,
    borderStyle: 'dashed',
    overflow: 'hidden',
    zIndex: 0,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoText: {
    ...typography.body,
    color: colors.primary,
    marginLeft: 8,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: Platform.OS === 'web' ? 10 : 0,
    zIndex: 0,
  },
  submitText: {
    ...typography.h3,
    color: colors.background,
  },
  photoChoiceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  photoChoiceSheet: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  photoChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  photoChoiceTitle: {
    ...typography.h3,
    color: colors.text,
  },
  photoChoiceClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  photoChoiceOption: {
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  photoChoiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChoiceText: {
    flex: 1,
  },
  photoChoiceLabel: {
    ...typography.body,
    fontWeight: '800',
  },
  photoChoiceHint: {
    ...typography.caption,
    marginTop: 3,
  },
});
