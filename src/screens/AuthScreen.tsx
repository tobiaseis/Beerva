import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Platform, Image } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Beer, MailCheck } from 'lucide-react-native';
import { Surface } from '../components/Surface';
import { AppButton } from '../components/AppButton';
import { radius, spacing } from '../theme/layout';
import { useFocused } from '../lib/useFocused';
import { getErrorMessage, withTimeout } from '../lib/timeouts';

type AuthNotice = {
  type: 'success' | 'error';
  message: string;
};

const DEFAULT_SITE_URL = 'https://beerva.vercel.app';
const AUTH_REQUEST_TIMEOUT_MS = 20000;
const beervaLogo = require('../../assets/beerva-header-logo.png');

const getEmailRedirectTo = () => {
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || DEFAULT_SITE_URL;
  return `${siteUrl}/auth-confirmed.html`;
};

export const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailFocus = useFocused();
  const passwordFocus = useFocused();
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  async function signInWithEmail() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setNotice({ type: 'error', message: 'Enter your email and password first.' });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        'Log in is taking too long. Check your connection and try again.'
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Could not log in. Please try again.');
      setNotice({ type: 'error', message });
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithEmail() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setNotice({ type: 'error', message: 'Enter your email and choose a password first.' });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const emailRedirectTo = getEmailRedirectTo();
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        'Sign up is taking too long. Check your connection and try again.'
      );

      if (error) {
        throw error;
      } else if (data.session) {
        setNotice({ type: 'success', message: 'Account created. Let’s finish your profile.' });
      } else {
        setPassword('');
        setIsLogin(true);
        setNotice({
          type: 'success',
          message: `Confirmation email sent to ${cleanEmail}. Open the link in your inbox, then log in here to finish your profile.`,
        });
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Could not sign up. Please try again.');
      setNotice({ type: 'error', message });
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image source={beervaLogo} style={styles.logoImage} />
        <Text style={styles.logoText}>Beerva</Text>
        <Text style={typography.bodyMuted}>The social network for beer lovers</Text>
      </View>

      <Surface style={styles.formContainer}>
        <TextInput
          style={[styles.input, emailFocus.focused ? styles.inputFocused : null]}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          onChangeText={setEmail}
          value={email}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          onFocus={emailFocus.onFocus}
          onBlur={emailFocus.onBlur}
        />
        <TextInput
          style={[styles.input, passwordFocus.focused ? styles.inputFocused : null]}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          autoCapitalize="none"
          textContentType={isLogin ? 'password' : 'newPassword'}
          onFocus={passwordFocus.onFocus}
          onBlur={passwordFocus.onBlur}
        />

        {notice ? (
          <View style={[styles.notice, notice.type === 'success' ? styles.noticeSuccess : styles.noticeError]}>
            {notice.type === 'success' ? (
              <MailCheck color={colors.success} size={20} />
            ) : (
              <Beer color={colors.danger} size={20} />
            )}
            <Text style={styles.noticeText}>{notice.message}</Text>
          </View>
        ) : null}

        <AppButton
          label={loading ? 'Loading...' : (isLogin ? 'Log In' : 'Sign Up')}
          loading={loading}
          onPress={isLogin ? signInWithEmail : signUpWithEmail}
        />

        <TouchableOpacity
          onPress={() => {
            setIsLogin(!isLogin);
            setNotice(null);
          }}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleText}>
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
          </Text>
        </TouchableOpacity>
      </Surface>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: Platform.OS === 'web' ? 24 : 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 34 : 60,
  },
  logoText: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 48,
    color: colors.primary,
    marginTop: 10,
  },
  logoImage: {
    width: 92,
    height: 88,
    resizeMode: 'contain',
  },
  formContainer: {
    padding: Platform.OS === 'web' ? spacing.lg : spacing.xl,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 16,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  noticeSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  noticeError: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(239, 68, 68, 0.28)',
  },
  noticeText: {
    ...typography.caption,
    flex: 1,
    color: colors.text,
    lineHeight: 19,
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    ...typography.bodyMuted,
  },
});
