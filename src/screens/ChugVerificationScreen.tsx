import React from 'react';
import { Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export const ChugVerificationScreen = () => (
  <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <Text style={[typography.h2, { color: colors.text, textAlign: 'center' }]}>Chug verification</Text>
  </View>
);
