import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Image, Text, ActivityIndicator } from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText, G } from 'react-native-svg';
import { PubCrawlStop } from '../lib/pubCrawls';
import { getStaticMapViewport } from '../lib/staticRouteMap';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius } from '../theme/layout';

type Props = {
  stops: PubCrawlStop[];
  width?: number;
  height?: number;
};

export const PubCrawlRouteMap = ({ stops, width = 640, height = 420 }: Props) => {
  const viewport = useMemo(() => getStaticMapViewport(stops, { width, height }), [stops, width, height]);

  const [failedTiles, setFailedTiles] = useState<Set<string>>(new Set());

  const handleTileError = (key: string) => {
    setFailedTiles(prev => new Set(prev).add(key));
  };

  if (viewport.mappedStops.length === 0) {
    return (
      <View style={[styles.container, { aspectRatio: width / height }]}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackTitle}>Route Map</Text>
          <Text style={styles.fallbackText}>No locations mapped for this crawl.</Text>
        </View>
      </View>
    );
  }

  const polylinePoints = viewport.routePoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View style={[styles.container, { aspectRatio: width / height }]}>
      <View style={styles.mapContainer}>
        {viewport.tiles.map(tile => (
          <View
            key={tile.key}
            style={[styles.tileWrapper, { left: tile.left, top: tile.top }]}
          >
            {!failedTiles.has(tile.key) ? (
              <Image
                source={{ uri: tile.url }}
                style={styles.tileImage}
                onError={() => handleTileError(tile.key)}
              />
            ) : (
              <View style={styles.tileError}>
                <ActivityIndicator color={colors.primarySoft} size="small" />
              </View>
            )}
          </View>
        ))}
        
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={colors.primary}
            strokeWidth="4"
            strokeDasharray="8,4"
          />
          {viewport.routePoints.map((point) => (
            <G key={point.stopOrder} x={point.x} y={point.y}>
              <Circle r="12" fill={colors.primary} />
              <Circle r="10" fill={colors.surface} />
              <SvgText
                fill={colors.primary}
                fontSize="12"
                fontWeight="bold"
                x="0"
                y="4"
                textAnchor="middle"
              >
                {point.stopOrder}
              </SvgText>
            </G>
          ))}
        </Svg>
      </View>

      <View style={styles.attributionContainer}>
        <Text style={styles.attributionText}>© OpenStreetMap</Text>
      </View>

      {viewport.missingCount > 0 && (
        <View style={styles.missingNote}>
          <Text style={styles.missingText}>
            {viewport.missingCount} {viewport.missingCount === 1 ? 'stop' : 'stops'} missing locations
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#E5E5E5', // typical map background
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  tileWrapper: {
    position: 'absolute',
    width: 256,
    height: 256,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileError: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attributionContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderTopLeftRadius: 4,
  },
  attributionText: {
    ...typography.tiny,
    color: '#333',
    fontSize: 9,
  },
  missingNote: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  missingText: {
    ...typography.caption,
    color: colors.background,
    fontSize: 10,
  },
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fallbackTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  fallbackText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
