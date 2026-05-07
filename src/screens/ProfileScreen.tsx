import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Award, Droplet } from 'lucide-react-native';

export const ProfileScreen = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' }} 
          style={styles.avatar} 
        />
        <Text style={typography.h1}>Alex D.</Text>
        <Text style={typography.bodyMuted}>Joined May 2026</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>124</Text>
          <Text style={styles.statLabel}>Pints Total</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>32</Text>
          <Text style={styles.statLabel}>Unique Pubs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>5.2%</Text>
          <Text style={styles.statLabel}>Avg ABV</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Award color={colors.primary} size={32} />
            <Text style={styles.badgeText}>Century Club</Text>
          </View>
          <View style={styles.badge}>
            <Droplet color={colors.success} size={32} />
            <Text style={styles.badgeText}>IPA Master</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 4,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  badges: {
    flexDirection: 'row',
    gap: 16,
  },
  badge: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    ...typography.caption,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
});
