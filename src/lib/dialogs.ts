import { Alert, Platform } from 'react-native';

export const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }

  Alert.alert(title, message);
};

export const confirmDestructive = (
  title: string,
  message: string,
  destructiveText: string,
  onConfirm: () => void
) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructiveText, style: 'destructive', onPress: onConfirm },
  ]);
};
