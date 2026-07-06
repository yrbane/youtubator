/* eslint-disable @typescript-eslint/no-explicit-any */

const TOKEN_PREFIX = 'youtubator.ytToken.';
const ACTIVE_KEY = 'youtubator.activeAccountId';
const CLIENT_ID_KEY = 'youtubator.ytClientId';
/**
 * youtube.force-ssl : lecture ET écriture (miroir favori ↔ « J'aime » via videos.rate) ;
 * openid/email/profile pour identifier le compte (multi-utilisateurs).
 */
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl openid email profile';
/** Marge avant expiration réelle du token. */
const EXPIRY_MARGIN_S = 60;

declare global {
  interface Window {
    google?: any;
  }
}

// --- Client ID OAuth (console Google Cloud) ---

export function getClientId(): string | null {
  return localStorage.getItem(CLIENT_ID_KEY);
}

export function setClientId(id: string): void {
  if (id.trim() === '') localStorage.removeItem(CLIENT_ID_KEY);
  else localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

// --- Tokens par compte (purs, testables) ---

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export function storeToken(
  accountId: string,
  accessToken: string,
  expiresInS: number,
  now: number = Date.now(),
): void {
  const stored: StoredToken = { accessToken, expiresAt: now + expiresInS * 1000 };
  sessionStorage.setItem(TOKEN_PREFIX + accountId, JSON.stringify(stored));
}

export function getValidToken(accountId: string, now: number = Date.now()): string | null {
  const raw = sessionStorage.getItem(TOKEN_PREFIX + accountId);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredToken;
    if (now >= stored.expiresAt - EXPIRY_MARGIN_S * 1000) return null;
    return stored.accessToken;
  } catch {
    return null;
  }
}

export function clearToken(accountId: string): void {
  sessionStorage.removeItem(TOKEN_PREFIX + accountId);
}

// --- Compte actif (persisté : on le retrouve d'une session à l'autre) ---

export function getActiveAccountId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveAccountId(id: string | null): void {
  if (id === null) localStorage.removeItem(ACTIVE_KEY);
  else localStorage.setItem(ACTIVE_KEY, id);
}

/** Token du compte actif (utilisé par la recherche). */
export function getActiveToken(now: number = Date.now()): string | null {
  const active = getActiveAccountId();
  return active ? getValidToken(active, now) : null;
}

// --- Google Identity Services (couche mince, non testée unitairement) ---

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger Google Identity Services'));
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

export interface SignInResult {
  accessToken: string;
  expiresInS: number;
}

/**
 * Demande un access token. Avec `hint` (email d'un compte déjà connu),
 * Google saute le sélecteur de compte — le switch est quasi instantané
 * si la session Google du navigateur est ouverte.
 */
export async function signIn(options: { hint?: string } = {}): Promise<SignInResult> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Renseigne d’abord un Client ID OAuth dans ⚙ Réglages.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      ...(options.hint ? { login_hint: options.hint, prompt: '' } : { prompt: 'select_account' }),
      callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
        if (response.error || !response.access_token) {
          reject(new Error(`Connexion refusée : ${response.error ?? 'pas de token'}`));
          return;
        }
        resolve({ accessToken: response.access_token, expiresInS: response.expires_in ?? 3600 });
      },
      error_callback: (e: { message?: string }) =>
        reject(new Error(e.message ?? 'Connexion Google annulée')),
    });
    client.requestAccessToken();
  });
}

export function revokeToken(accountId: string): void {
  const token = getValidToken(accountId);
  clearToken(accountId);
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
}
