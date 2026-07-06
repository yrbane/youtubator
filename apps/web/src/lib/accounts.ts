/** Profil d'un compte YouTube mémorisé (persisté en IndexedDB). */
export interface AccountProfile {
  /** Email Google — clé stable du compte et login_hint pour le re-connecter. */
  accountId: string;
  channelId: string | null;
  title: string;
  email: string;
  avatarUrl: string | null;
  likedPlaylistId: string | null;
}

interface RawChannels {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
    contentDetails?: { relatedPlaylists?: { likes?: string } };
  }>;
}

interface RawUserinfo {
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Fusionne la réponse channels?mine=true et le userinfo Google en profil.
 * La chaîne YouTube prime (titre, avatar) ; le userinfo comble les trous
 * et fournit l'email (clé + login_hint).
 */
export function mapChannelToProfile(channels: RawChannels, userinfo: RawUserinfo): AccountProfile | null {
  const channel = channels.items?.[0];
  const email = userinfo.email ?? null;
  if (!channel && !email) return null;
  if (!email) return null; // sans email, impossible de re-connecter le compte plus tard
  return {
    accountId: email,
    channelId: channel?.id ?? null,
    title: channel?.snippet?.title ?? userinfo.name ?? email,
    email,
    avatarUrl: channel?.snippet?.thumbnails?.['default']?.url ?? userinfo.picture ?? null,
    likedPlaylistId: channel?.contentDetails?.relatedPlaylists?.likes ?? null,
  };
}
