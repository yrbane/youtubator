/* eslint-disable @typescript-eslint/no-explicit-any */

const TOKEN_KEY = 'youtubator.ytToken';
const CLIENT_ID_KEY = 'youtubator.ytClientId';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
/** Marge avant expiration réelle du token. */
const EXPIRY_MARGIN_S = 60;

declare global {
  interface Window {
    google?: any;
  }
}

// --- Client ID OAuth (console Google Cloud), stocké comme la clé API ---

export function getClientId(): string | null {
  return localStorage.getItem(CLIENT_ID_KEY);
}

export function setClientId(id: string): void {
  if (id.trim() === '') localStorage.removeItem(CLIENT_ID_KEY);
  else localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

// --- Cycle de vie du token (pur, testable) ---

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export function storeToken(accessToken: string, expiresInS: number, now: number = Date.now()): void {
  const stored: StoredToken = { accessToken, expiresAt: now + expiresInS * 1000 };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
}

export function getValidToken(now: number = Date.now()): string | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredToken;
    if (now >= stored.expiresAt - EXPIRY_MARGIN_S * 1000) return null;
    return stored.accessToken;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
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

/**
 * Ouvre le consentement Google et retourne un access token youtube.readonly.
 * Nécessite un Client ID OAuth (⚙ Réglages) dont l'origine autorisée
 * correspond à l'URL de l'app.
 */
export async function signIn(): Promise<string> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Renseigne d’abord un Client ID OAuth dans ⚙ Réglages.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
        if (response.error || !response.access_token) {
          reject(new Error(`Connexion refusée : ${response.error ?? 'pas de token'}`));
          return;
        }
        storeToken(response.access_token, response.expires_in ?? 3600);
        resolve(response.access_token);
      },
      error_callback: (e: { message?: string }) =>
        reject(new Error(e.message ?? 'Connexion Google annulée')),
    });
    client.requestAccessToken();
  });
}

export function signOut(): void {
  const token = getValidToken();
  clearToken();
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
}
