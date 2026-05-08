export const fontFamily = {
  brand: 'Righteous_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

export const typography = {
  h1: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fontFamily.bodyBold,
    fontWeight: '800' as const,
    color: '#F8FAFC',
  },
  h2: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamily.bodyBold,
    fontWeight: '800' as const,
    color: '#F8FAFC',
  },
  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fontFamily.bodySemiBold,
    fontWeight: '700' as const,
    color: '#F8FAFC',
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: fontFamily.body,
    fontWeight: '400' as const,
    color: '#F8FAFC',
  },
  bodyMuted: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: fontFamily.body,
    fontWeight: '400' as const,
    color: '#94A3B8',
  },
  caption: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: fontFamily.body,
    fontWeight: '400' as const,
    color: '#94A3B8',
  },
  tiny: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.bodySemiBold,
    fontWeight: '600' as const,
    color: '#94A3B8',
  },
};
