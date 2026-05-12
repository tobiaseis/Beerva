import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Coffee, Frown, ShieldCheck } from 'lucide-react-native';

import { AppButton } from '../components/AppButton';
import { Surface } from '../components/Surface';
import { showAlert } from '../lib/dialogs';
import { hapticError, hapticLight, hapticSuccess } from '../lib/haptics';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type HangoverTargetType = 'session' | 'pub_crawl';

type TargetSummary = {
  title: string;
  subtitle: string;
  currentScore: number | null;
};

const scoreLabels: Record<number, string> = {
  1: 'Fresh',
  2: 'Fine',
  3: 'Thirsty',
  4: 'Creaky',
  5: 'Foggy',
  6: 'Fragile',
  7: 'Haunted',
  8: 'Ruined',
  9: 'Pray',
  10: 'Legend',
};

const formatPublishedAt = (dateString?: string | null) => {
  if (!dateString) return 'Last night';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Last night';
  return date.toLocaleString([], {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const HangoverRatingScreen = ({ navigation, route }: any) => {
  const targetType = route?.params?.targetType as HangoverTargetType | undefined;
  const targetId = route?.params?.targetId as string | undefined;
  const [summary, setSummary] = useState<TargetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingScore, setSubmittingScore] = useState<number | null>(null);

  const loadTarget = useCallback(async () => {
    if (!targetType || !targetId) {
      setLoading(false);
      setSummary(null);
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You need to be signed in to rate this hangover.');

      if (targetType === 'session') {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, user_id, pub_name, published_at, created_at, hangover_score, status')
          .eq('id', targetId)
          .maybeSingle();

        if (error) throw error;
        if (!data || data.user_id !== user.id || data.status !== 'published') {
          throw new Error('This session is not available to rate.');
        }

        setSummary({
          title: data.pub_name || 'Last night',
          subtitle: `Posted ${formatPublishedAt(data.published_at || data.created_at)}`,
          currentScore: typeof data.hangover_score === 'number' ? data.hangover_score : null,
        });
        return;
      }

      const { data: crawl, error: crawlError } = await supabase
        .from('pub_crawls')
        .select('id, user_id, published_at, created_at, hangover_score, status')
        .eq('id', targetId)
        .maybeSingle();

      if (crawlError) throw crawlError;
      if (!crawl || crawl.user_id !== user.id || crawl.status !== 'published') {
        throw new Error('This pub crawl is not available to rate.');
      }

      const { data: stops, error: stopsError } = await supabase
        .from('sessions')
        .select('pub_name, crawl_stop_order')
        .eq('pub_crawl_id', targetId)
        .order('crawl_stop_order', { ascending: true })
        .limit(3);

      if (stopsError) {
        console.warn('Could not load pub crawl stops for hangover rating:', stopsError);
      }

      const routeLabel = (stops || [])
        .map((stop: any) => stop.pub_name)
        .filter(Boolean)
        .join(' -> ');

      setSummary({
        title: routeLabel || 'Pub crawl',
        subtitle: `Posted ${formatPublishedAt(crawl.published_at || crawl.created_at)}`,
        currentScore: typeof crawl.hangover_score === 'number' ? crawl.hangover_score : null,
      });
    } catch (error: any) {
      console.error('Hangover target load error:', error);
      setSummary(null);
      showAlert('Could not load hangover check', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    loadTarget();
  }, [loadTarget]);

  const submitScore = useCallback(async (score: number) => {
    if (!targetType || !targetId || submittingScore) return;

    hapticLight();
    setSubmittingScore(score);
    try {
      const { error } = await supabase.rpc('rate_hangover', {
        target_kind: targetType,
        target_id: targetId,
        target_score: score,
      });

      if (error) throw error;

      hapticSuccess();
      navigation.navigate('MainTabs', { screen: 'Feed' });
    } catch (error: any) {
      hapticError();
      showAlert('Could not save rating', error?.message || 'Please try again.');
    } finally {
      setSubmittingScore(null);
    }
  }, [navigation, submittingScore, targetId, targetType]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Hangover Check</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          <Surface style={styles.hero}>
            <View style={styles.iconBadge}>
              <Coffee color={colors.background} size={28} />
            </View>
            <Text style={styles.title}>How cooked are we?</Text>
            <Text style={styles.subtitle}>
              Give last night a damage score before your brain starts editing the evidence.
            </Text>
          </Surface>

          {summary ? (
            <Surface style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryIcon}>
                  <Frown color={colors.primary} size={22} />
                </View>
                <View style={styles.summaryText}>
                  <Text style={styles.summaryTitle} numberOfLines={2}>{summary.title}</Text>
                  <Text style={styles.summarySubtitle}>{summary.subtitle}</Text>
                </View>
              </View>

              {summary.currentScore ? (
                <View style={styles.currentScore}>
                  <ShieldCheck color={colors.success} size={17} />
                  <Text style={styles.currentScoreText}>Current hangover: {summary.currentScore}/10</Text>
                </View>
              ) : null}

              <View style={styles.scoreGrid}>
                {Array.from({ length: 10 }, (_, index) => {
                  const score = index + 1;
                  const isSubmitting = submittingScore === score;

                  return (
                    <TouchableOpacity
                      key={score}
                      style={[styles.scoreButton, isSubmitting ? styles.scoreButtonActive : null]}
                      onPress={() => submitScore(score)}
                      disabled={submittingScore !== null}
                      activeOpacity={0.76}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate hangover ${score} out of 10`}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color={colors.background} size="small" />
                      ) : (
                        <>
                          <Text style={styles.scoreNumber}>{score}</Text>
                          <Text style={styles.scoreLabel} numberOfLines={1}>{scoreLabels[score]}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Surface>
          ) : (
            <Surface style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Nothing to rate here.</Text>
              <Text style={styles.summarySubtitle}>The post may have been deleted or already drifted into legend.</Text>
              <AppButton label="Back to feed" onPress={() => navigation.navigate('MainTabs', { screen: 'Feed' })} />
            </Surface>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  iconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  summaryCard: {
    gap: spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    ...typography.h3,
  },
  summarySubtitle: {
    ...typography.caption,
    marginTop: 3,
  },
  currentScore: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.30)',
  },
  currentScoreText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '900',
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scoreButton: {
    width: '18%',
    minWidth: 82,
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 6,
  },
  scoreButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scoreNumber: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    ...typography.tiny,
    marginTop: 3,
    color: colors.textMuted,
    fontWeight: '800',
  },
});
