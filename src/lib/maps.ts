import { Linking, Platform } from 'react-native';

export const openMaps = (query: string) => {
  if (!query) return;
  
  const encodedQuery = encodeURIComponent(query);
  const url = Platform.select({
    ios: `maps:0,0?q=${encodedQuery}`,
    android: `geo:0,0?q=${encodedQuery}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
  });

  if (url) {
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedQuery}`);
        }
      })
      .catch((err) => console.error('An error occurred opening maps', err));
  }
};
