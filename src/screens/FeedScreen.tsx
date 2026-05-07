import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, MapPin } from 'lucide-react-native';

const MOCK_FEED = [
  {
    id: '1',
    user: 'Alex D.',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    pub: 'The Red Lion',
    beer: 'Guinness',
    volume: '1 Pint',
    time: '2 hours ago',
    image: 'https://images.unsplash.com/photo-1575037614876-c385ab4f3f4c?auto=format&fit=crop&w=800&q=80',
    likes: 12,
  },
  {
    id: '2',
    user: 'Sarah M.',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
    pub: 'BrewDog Soho',
    beer: 'Punk IPA',
    volume: '1/2 Pint',
    time: '5 hours ago',
    likes: 8,
  }
];

export const FeedScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Beer color={colors.primary} size={28} />
          <Text style={styles.logoText}>Beerva</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {MOCK_FEED.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.user}</Text>
                <Text style={styles.timeText}>{item.time}</Text>
              </View>
            </View>
            
            {item.image && (
              <Image source={{ uri: item.image }} style={styles.feedImage} />
            )}

            <View style={styles.cardContent}>
              <View style={styles.row}>
                <MapPin color={colors.primary} size={16} />
                <Text style={styles.locationText}> Drinking at <Text style={styles.bold}>{item.pub}</Text></Text>
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <Beer color={colors.primary} size={16} />
                <Text style={styles.beerText}> {item.volume} of <Text style={styles.bold}>{item.beer}</Text></Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.actionBtn}>
                <Beer color={colors.textMuted} size={20} />
                <Text style={styles.actionText}>{item.likes} Cheers</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 28,
    color: colors.primary,
    marginLeft: 8,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...typography.h3,
    fontSize: 16,
  },
  timeText: {
    ...typography.caption,
  },
  feedImage: {
    width: '100%',
    height: 250,
  },
  cardContent: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    ...typography.body,
    color: colors.text,
  },
  beerText: {
    ...typography.body,
    color: colors.text,
  },
  bold: {
    fontWeight: '700',
    color: colors.primary,
  },
  cardFooter: {
    padding: 16,
    flexDirection: 'row',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    ...typography.bodyMuted,
    marginLeft: 8,
    fontWeight: '600',
  },
});
