import { PubCrawlStop } from './pubCrawls';

const TILE_SIZE = 256;
const MIN_MERCATOR_LAT = -85.05112878;
const MAX_MERCATOR_LAT = 85.05112878;

export type MapSize = {
  width: number;
  height: number;
};

export type MappedPubCrawlStop = PubCrawlStop & {
  latitude: number;
  longitude: number;
};

export type RouteBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  missingCount: number;
};

export type StaticMapTile = {
  key: string;
  x: number;
  y: number;
  z: number;
  left: number;
  top: number;
  url: string;
};

export type StaticMapViewport = {
  width: number;
  height: number;
  zoom: number;
  centerLatitude: number;
  centerLongitude: number;
  mappedStops: MappedPubCrawlStop[];
  missingCount: number;
  tiles: StaticMapTile[];
  routePoints: Array<{ x: number; y: number; stopOrder: number }>;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const longitudeToTileX = (longitude: number, zoom: number) => {
  const scale = 2 ** zoom;
  return ((longitude + 180) / 360) * scale;
};

const latitudeToTileY = (latitude: number, zoom: number) => {
  const safeLatitude = clamp(latitude, MIN_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const radians = safeLatitude * Math.PI / 180;
  const scale = 2 ** zoom;
  return (
    (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2
  ) * scale;
};

const tileXToLongitude = (tileX: number, zoom: number) => (tileX / (2 ** zoom)) * 360 - 180;

const tileYToLatitude = (tileY: number, zoom: number) => {
  const radians = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / (2 ** zoom))));
  return radians * 180 / Math.PI;
};

export const latLonToTile = (latitude: number, longitude: number, zoom: number) => ({
  x: longitudeToTileX(longitude, zoom),
  y: latitudeToTileY(latitude, zoom),
  z: zoom,
});

export const projectLatLonToWorld = (latitude: number, longitude: number, zoom: number) => {
  const tile = latLonToTile(latitude, longitude, zoom);
  return {
    x: tile.x * TILE_SIZE,
    y: tile.y * TILE_SIZE,
  };
};

export const getMappedStops = (stops: PubCrawlStop[] = []) => {
  const mappedStops = stops.filter((stop): stop is MappedPubCrawlStop => (
    typeof stop.latitude === 'number'
    && Number.isFinite(stop.latitude)
    && typeof stop.longitude === 'number'
    && Number.isFinite(stop.longitude)
  ));

  return Object.assign(mappedStops, {
    missingCount: stops.length - mappedStops.length,
  });
};

export const getRouteBounds = (mappedStops: MappedPubCrawlStop[]): RouteBounds => {
  const missingCount = (mappedStops as MappedPubCrawlStop[] & { missingCount?: number }).missingCount || 0;

  if (mappedStops.length === 0) {
    return {
      minLatitude: 55.6,
      maxLatitude: 57.8,
      minLongitude: 8.0,
      maxLongitude: 12.8,
      missingCount,
    };
  }

  const latitudes = mappedStops.map((stop) => stop.latitude);
  const longitudes = mappedStops.map((stop) => stop.longitude);

  return {
    minLatitude: Math.min(...latitudes),
    maxLatitude: Math.max(...latitudes),
    minLongitude: Math.min(...longitudes),
    maxLongitude: Math.max(...longitudes),
    missingCount,
  };
};

const selectZoom = (bounds: RouteBounds, size: MapSize) => {
  for (let zoom = 17; zoom >= 5; zoom -= 1) {
    const northWest = projectLatLonToWorld(bounds.maxLatitude, bounds.minLongitude, zoom);
    const southEast = projectLatLonToWorld(bounds.minLatitude, bounds.maxLongitude, zoom);
    const routeWidth = Math.abs(southEast.x - northWest.x);
    const routeHeight = Math.abs(southEast.y - northWest.y);

    if (routeWidth <= size.width * 0.72 && routeHeight <= size.height * 0.72) {
      return zoom;
    }
  }

  return 5;
};

export const getStaticMapViewport = (
  stops: PubCrawlStop[] = [],
  size: MapSize = { width: 640, height: 420 }
): StaticMapViewport => {
  const mappedStops = getMappedStops(stops);
  const bounds = getRouteBounds(mappedStops);
  const centerLatitude = mappedStops.length > 0
    ? (bounds.minLatitude + bounds.maxLatitude) / 2
    : 56.2639;
  const centerLongitude = mappedStops.length > 0
    ? (bounds.minLongitude + bounds.maxLongitude) / 2
    : 9.5018;
  const zoom = mappedStops.length <= 1 ? 15 : selectZoom(bounds, size);
  const centerWorld = projectLatLonToWorld(centerLatitude, centerLongitude, zoom);
  const topLeftWorld = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  };
  const minTileX = Math.floor(topLeftWorld.x / TILE_SIZE);
  const minTileY = Math.floor(topLeftWorld.y / TILE_SIZE);
  const maxTileX = Math.floor((topLeftWorld.x + size.width) / TILE_SIZE);
  const maxTileY = Math.floor((topLeftWorld.y + size.height) / TILE_SIZE);
  const tileLimit = 2 ** zoom;
  const tiles: StaticMapTile[] = [];

  for (let y = minTileY; y <= maxTileY; y += 1) {
    for (let x = minTileX; x <= maxTileX; x += 1) {
      if (y < 0 || y >= tileLimit) continue;
      const wrappedX = ((x % tileLimit) + tileLimit) % tileLimit;
      tiles.push({
        key: `${zoom}-${wrappedX}-${y}`,
        x: wrappedX,
        y,
        z: zoom,
        left: x * TILE_SIZE - topLeftWorld.x,
        top: y * TILE_SIZE - topLeftWorld.y,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
      });
    }
  }

  const routePoints = mappedStops.map((stop) => {
    const world = projectLatLonToWorld(stop.latitude, stop.longitude, zoom);
    return {
      x: world.x - topLeftWorld.x,
      y: world.y - topLeftWorld.y,
      stopOrder: stop.stopOrder,
    };
  });

  return {
    width: size.width,
    height: size.height,
    zoom,
    centerLatitude,
    centerLongitude,
    mappedStops,
    missingCount: bounds.missingCount,
    tiles,
    routePoints,
  };
};

export const projectCoordinatesToViewport = (
  coordinates: [number, number][],
  centerLatitude: number,
  centerLongitude: number,
  zoom: number,
  size: MapSize
) => {
  const centerWorld = projectLatLonToWorld(centerLatitude, centerLongitude, zoom);
  const topLeftWorld = {
    x: centerWorld.x - size.width / 2,
    y: centerWorld.y - size.height / 2,
  };

  return coordinates.map((coord) => {
    // GeoJSON is [longitude, latitude]
    const world = projectLatLonToWorld(coord[1], coord[0], zoom);
    return {
      x: world.x - topLeftWorld.x,
      y: world.y - topLeftWorld.y,
    };
  });
};

export const staticMapTileBoundsToCoordinates = (tile: Pick<StaticMapTile, 'x' | 'y' | 'z'>) => ({
  north: tileYToLatitude(tile.y, tile.z),
  south: tileYToLatitude(tile.y + 1, tile.z),
  west: tileXToLongitude(tile.x, tile.z),
  east: tileXToLongitude(tile.x + 1, tile.z),
});
