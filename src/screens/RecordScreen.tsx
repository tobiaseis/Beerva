import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Camera, MapPin, Beer } from 'lucide-react-native';

export const RecordScreen = () => {
  const [beer, setBeer] = useState('');
  const [pub, setPub] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.h2}>Record a Pint</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.inputContainer}>
          <MapPin color={colors.textMuted} size={20} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Where are you drinking?"
            placeholderTextColor={colors.textMuted}
            value={pub}
            onChangeText={setPub}
          />
        </View>

        <View style={styles.inputContainer}>
          <Beer color={colors.textMuted} size={20} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="What are you drinking?"
            placeholderTextColor={colors.textMuted}
            value={beer}
            onChangeText={setBeer}
          />
        </View>

        <TouchableOpacity style={styles.photoButton}>
          <Camera color={colors.primary} size={24} />
          <Text style={styles.photoText}>Add Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitButton}>
          <Text style={styles.submitText}>Save Session</Text>
        </TouchableOpacity>
      </View>
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
  content: {
    padding: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    height: 56,
    marginBottom: 32,
    borderStyle: 'dashed',
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
  },
  submitText: {
    ...typography.h3,
    color: colors.background,
  },
});
