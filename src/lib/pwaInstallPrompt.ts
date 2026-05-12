export const INSTALL_PROMPT_DISMISSED_AT_KEY = 'beerva.installPrompt.dismissedAt';
export const INSTALL_PROMPT_DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type BrowserInstallEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
};

type InstallPromptStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const getBrowserInstallEnvironment = (): BrowserInstallEnvironment | null => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;

  return {
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    matchMedia: window.matchMedia?.bind(window),
  };
};

export const getInstallPromptStorage = (): InstallPromptStorage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isStandaloneDisplay = (environment: BrowserInstallEnvironment | null) => (
  Boolean(
    environment?.standalone
    || environment?.matchMedia?.('(display-mode: standalone)').matches
    || environment?.matchMedia?.('(display-mode: fullscreen)').matches
  )
);

export const isIosDevice = (environment: BrowserInstallEnvironment | null) => {
  if (!environment) return false;

  return /iPad|iPhone|iPod/.test(environment.userAgent)
    || (environment.platform === 'MacIntel' && environment.maxTouchPoints > 1);
};

export const isIosSafari = (environment: BrowserInstallEnvironment | null) => {
  if (!isIosDevice(environment)) return false;

  const userAgent = environment?.userAgent || '';
  const isSafari = /Safari/.test(userAgent);
  const isThirdPartyIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/i.test(userAgent);

  return isSafari && !isThirdPartyIosBrowser;
};

export const wasInstallPromptRecentlyDismissed = (
  storage: InstallPromptStorage | null,
  now = Date.now()
) => {
  if (!storage) return false;

  const dismissedAt = Number(storage.getItem(INSTALL_PROMPT_DISMISSED_AT_KEY));
  if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;

  return now - dismissedAt < INSTALL_PROMPT_DISMISS_WINDOW_MS;
};

export const rememberInstallPromptDismissed = (
  storage: InstallPromptStorage | null,
  now = Date.now()
) => {
  if (!storage) return;

  storage.setItem(INSTALL_PROMPT_DISMISSED_AT_KEY, String(now));
};
