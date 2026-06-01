import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react-native';

import { createChugProofSignedUrl } from '../lib/chugProofStorage';
import { formatChugDuration, formatChugStatusLabel } from '../lib/chugAttempts';
import {
  calculateManualChugDuration,
  CHUG_MANUAL_PLAYBACK_RATE,
  getVideoPlaybackTimestampMs,
} from '../lib/chugManualTiming';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type ReviewAttempt = {
  id: string;
  user_id: string;
  verifier_user_id: string;
  status: string;
  duration_ms: number;
  confidence_score?: number | null;
  video_path?: string | null;
  verifier_note?: string | null;
  sessions?: { pub_name?: string | null } | null;
  session_beers?: { beer_name?: string | null; volume?: string | null } | null;
};

type OwnerProfile = {
  username?: string | null;
  avatar_url?: string | null;
};

type ReviewMode = 'review' | 'reject_options' | 'manual_timing';

type WebVideoHandle = {
  getCurrentTimestampMs: () => number | null;
  resetAndPlaySlowMotion: () => Promise<void>;
};

const WebVideo = React.forwardRef<WebVideoHandle, { uri: string }>(({ uri }, ref) => {
  const videoRef = useRef<any>(null);

  React.useImperativeHandle(ref, () => ({
    getCurrentTimestampMs: () => getVideoPlaybackTimestampMs(videoRef.current?.currentTime),
    resetAndPlaySlowMotion: async () => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = 0;
      videoRef.current.playbackRate = CHUG_MANUAL_PLAYBACK_RATE;
      await videoRef.current.play();
    },
  }), []);

  if (Platform.OS !== 'web') return null;
  return React.createElement('video', {
    ref: videoRef,
    src: uri,
    controls: true,
    playsInline: true,
    style: {
      width: '100%',
      maxHeight: 360,
      borderRadius: 8,
      backgroundColor: '#000',
    },
  });
});

export const ChugVerificationScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const attemptId = route?.params?.attemptId as string | undefined;
  const notificationId = route?.params?.notificationId as string | undefined;
  const videoRef = useRef<WebVideoHandle | null>(null);
  const [attempt, setAttempt] = useState<ReviewAttempt | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<'verified' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('review');
  const [manualStartMs, setManualStartMs] = useState<number | null>(null);
  const [manualEndMs, setManualEndMs] = useState<number | null>(null);
  const manualDurationMs = calculateManualChugDuration(manualStartMs, manualEndMs);

  const fetchAttempt = useCallback(async () => {
    if (!attemptId) {
      setError('Chug attempt not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('session_chug_attempts')
        .select(`
          id,
          user_id,
          verifier_user_id,
          status,
          duration_ms,
          confidence_score,
          video_path,
          verifier_note,
          sessions(pub_name),
          session_beers(beer_name, volume)
        `)
        .eq('id', attemptId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!data) throw new Error('Chug attempt not found.');

      const row = data as ReviewAttempt;
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', row.user_id)
        .maybeSingle();

      if (profileError) console.error('Chug owner profile fetch error:', profileError);

      setAttempt(row);
      setOwnerProfile(profileData || null);
      setNote(row.verifier_note || '');
      setVideoUrl(row.video_path ? await createChugProofSignedUrl(row.video_path) : null);
      setReviewMode('review');
      setManualStartMs(null);
      setManualEndMs(null);

      if (notificationId) {
        supabase.from('notifications').update({ read: true }).eq('id', notificationId).then(() => {});
      }
    } catch (reviewError: any) {
      setError(reviewError?.message || 'Could not load chug attempt.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, notificationId]);

  useFocusEffect(
    useCallback(() => {
      fetchAttempt();
    }, [fetchAttempt])
  );

  const reviewAttempt = useCallback(async (
    nextStatus: 'verified' | 'rejected',
    manualTiming?: { startMs: number; endMs: number }
  ) => {
    if (!attemptId || reviewing) return;
    setReviewing(nextStatus);
    setError(null);
    try {
      const { error: reviewError } = await supabase.rpc('review_chug_attempt', {
        target_attempt_id: attemptId,
        next_status: nextStatus,
        note,
        manual_start_ms: manualTiming?.startMs ?? null,
        manual_end_ms: manualTiming?.endMs ?? null,
      });
      if (reviewError) throw reviewError;
      await fetchAttempt();
    } catch (reviewError: any) {
      setError(reviewError?.message || 'Could not review chug attempt.');
    } finally {
      setReviewing(null);
    }
  }, [attemptId, fetchAttempt, note, reviewing]);

  const restartManualTiming = useCallback(async () => {
    setManualStartMs(null);
    setManualEndMs(null);
    setError(null);
    try {
      if (!videoRef.current) {
        setError('Proof video is unavailable.');
        return;
      }
      await videoRef.current.resetAndPlaySlowMotion();
    } catch {
      setError('Could not start slow-motion playback. Use the video controls and try again.');
    }
  }, []);

  const enterManualTiming = useCallback(async () => {
    setReviewMode('manual_timing');
    await restartManualTiming();
  }, [restartManualTiming]);

  const captureManualTimestamp = useCallback(() => {
    const timestampMs = videoRef.current?.getCurrentTimestampMs() ?? null;
    if (timestampMs === null) {
      setError('Could not read the video position.');
      return;
    }

    if (manualStartMs === null) {
      setManualStartMs(timestampMs);
      setManualEndMs(null);
      setError(null);
      return;
    }

    if (calculateManualChugDuration(manualStartMs, timestampMs) === null) {
      setError('Stop must be after Start and within 15 seconds.');
      return;
    }

    setManualEndMs(timestampMs);
    setError(null);
  }, [manualStartMs]);

  const approveManualTiming = useCallback(() => {
    if (manualStartMs === null || manualEndMs === null || manualDurationMs === null) {
      setError('Record a valid Start and Stop time first.');
      return;
    }
    reviewAttempt('verified', { startMs: manualStartMs, endMs: manualEndMs });
  }, [manualDurationMs, manualEndMs, manualStartMs, reviewAttempt]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Chug verification</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error && !attempt ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : attempt ? (
        <View style={styles.content}>
          <View style={styles.panel}>
            <Text style={styles.kicker}>{attempt.sessions?.pub_name || 'Session chug'}</Text>
            <Text style={styles.meta}>{ownerProfile?.username || 'Someone'} asked you to review this</Text>
            <Text style={styles.title}>{attempt.session_beers?.beer_name || '33cl beer'}</Text>
            <Text style={styles.duration}>{formatChugDuration(attempt.duration_ms)}</Text>
            <Text style={styles.meta}>{formatChugStatusLabel(attempt.status)}</Text>
          </View>

          {videoUrl ? (
            <View style={styles.videoPanel}>
              <WebVideo ref={videoRef} uri={videoUrl} />
              {Platform.OS !== 'web' ? (
                <Text style={styles.meta}>Proof video review is available in the web app for this version.</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.meta}>Proof video has already been cleared.</Text>
            </View>
          )}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor={colors.textMuted}
            style={styles.noteInput}
            multiline
            maxLength={160}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {attempt.status === 'unverified' && reviewMode === 'review' ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => setReviewMode('reject_options')}
                disabled={Boolean(reviewing)}
              >
                <XCircle color={colors.text} size={18} />
                <Text style={styles.actionText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => reviewAttempt('verified')}
                disabled={Boolean(reviewing)}
              >
                {reviewing === 'verified' ? <ActivityIndicator color={colors.background} /> : <CheckCircle2 color={colors.background} size={18} />}
                <Text style={[styles.actionText, styles.approveText]}>Verify</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {attempt.status === 'unverified' && reviewMode === 'reject_options' ? (
            <View style={styles.decisionPanel}>
              <Text style={styles.decisionTitle}>What needs changing?</Text>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={enterManualTiming}
                disabled={Platform.OS !== 'web' || !videoUrl}
              >
                <Text style={[styles.actionText, styles.approveText]}>Adjust time</Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' ? (
                <Text style={styles.meta}>Manual timing is available in the web app for this version.</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.actionButton, styles.destructiveButton]}
                onPress={() => reviewAttempt('rejected')}
                disabled={Boolean(reviewing)}
              >
                {reviewing === 'rejected' ? <ActivityIndicator color={colors.text} /> : <XCircle color={colors.text} size={18} />}
                <Text style={styles.actionText}>Reject chug completely</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setReviewMode('review')}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {attempt.status === 'unverified' && reviewMode === 'manual_timing' ? (
            <View style={styles.decisionPanel}>
              <Text style={styles.decisionTitle}>Adjust chug time</Text>
              <Text style={styles.meta}>Video plays at 0.75x. Mark the exact drinking window.</Text>
              <TouchableOpacity
                style={[styles.timingButton, manualStartMs !== null && manualEndMs === null ? styles.stopTimingButton : null]}
                onPress={captureManualTimestamp}
                disabled={manualEndMs !== null}
              >
                <Text style={styles.timingButtonText}>{manualStartMs === null ? 'Start' : 'Stop'}</Text>
              </TouchableOpacity>
              {manualDurationMs !== null ? (
                <Text style={styles.manualDuration}>{formatChugDuration(manualDurationMs)}</Text>
              ) : null}
              {manualDurationMs !== null ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={approveManualTiming}
                  disabled={Boolean(reviewing)}
                >
                  {reviewing === 'verified' ? <ActivityIndicator color={colors.background} /> : <CheckCircle2 color={colors.background} size={18} />}
                  <Text style={[styles.actionText, styles.approveText]}>Approve time</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.secondaryButton} onPress={restartManualTiming}>
                <Text style={styles.secondaryButtonText}>Re-do timing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setReviewMode('reject_options')}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
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
  },
  screenTitle: {
    ...typography.h3,
    color: colors.text,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    padding: 18,
    gap: spacing.md,
  },
  panel: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
  },
  videoPanel: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
  },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  duration: {
    ...typography.h1,
    color: colors.text,
    marginTop: 10,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  noteInput: {
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  decisionPanel: {
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
  },
  decisionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  destructiveButton: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  secondaryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '800',
  },
  timingButton: {
    minHeight: 82,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stopTimingButton: {
    backgroundColor: colors.danger,
  },
  timingButtonText: {
    ...typography.h2,
    color: colors.background,
    fontWeight: '900',
  },
  manualDuration: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  actionText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  approveText: {
    color: colors.background,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
