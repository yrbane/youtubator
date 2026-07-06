import { mapChannelToProfile, type AccountProfile } from './accounts.js';
import {
  clearToken,
  getActiveAccountId,
  getValidToken,
  revokeToken,
  setActiveAccountId,
  signIn,
  storeToken,
} from './youtube-auth.js';
import { fetchAccountIdentity } from './youtube-account.js';
import {
  deleteAccount,
  listAccounts,
  saveAccount,
  GUEST_ATTRIBUTION,
  type Attribution,
  type StoredAccount,
} from './library.js';

/**
 * Session multi-utilisateurs : les profils des comptes YouTube connectés au
 * moins une fois sont persistés ; on switche d'un clic (login_hint = email,
 * quasi instantané si la session Google du navigateur est ouverte).
 */
export class Session {
  accounts = $state<StoredAccount[]>([]);
  activeId = $state<string | null>(getActiveAccountId());
  connecting = $state(false);

  get active(): StoredAccount | null {
    return this.accounts.find((a) => a.accountId === this.activeId) ?? null;
  }

  /** Le compte actif a-t-il un token utilisable en ce moment ? */
  get activeToken(): string | null {
    return this.activeId ? getValidToken(this.activeId) : null;
  }

  /** Attribution des actions (historique, favoris, recherches). */
  get attribution(): Attribution {
    const active = this.active;
    return active ? { byId: active.accountId, by: active.title } : GUEST_ATTRIBUTION;
  }

  async init(): Promise<void> {
    this.accounts = await listAccounts();
    if (this.activeId && !this.accounts.some((a) => a.accountId === this.activeId)) {
      this.activeId = null;
      setActiveAccountId(null);
    }
  }

  /** Ouvre le sélecteur Google et enregistre (ou met à jour) le compte choisi. */
  async addAccount(): Promise<StoredAccount> {
    return this.#connect({});
  }

  /**
   * Bascule sur un compte mémorisé. Token de session encore valide → immédiat ;
   * sinon re-demande un token avec login_hint (pas de sélecteur de compte).
   */
  async switchTo(accountId: string): Promise<string> {
    const existing = getValidToken(accountId);
    if (existing) {
      this.activeId = accountId;
      setActiveAccountId(accountId);
      await saveAccount(this.accounts.find((a) => a.accountId === accountId)!);
      this.accounts = await listAccounts();
      return existing;
    }
    const account = await this.#connect({ hint: accountId });
    return getValidToken(account.accountId)!;
  }

  /** Déconnecte (révoque le token de session) sans oublier le profil. */
  signOut(accountId: string): void {
    revokeToken(accountId);
    if (this.activeId === accountId) {
      this.activeId = null;
      setActiveAccountId(null);
    }
  }

  /** Oublie complètement un profil mémorisé. */
  async forget(accountId: string): Promise<void> {
    this.signOut(accountId);
    clearToken(accountId);
    await deleteAccount(accountId);
    this.accounts = await listAccounts();
  }

  async #connect(options: { hint?: string }): Promise<StoredAccount> {
    this.connecting = true;
    try {
      const { accessToken, expiresInS } = await signIn(options);
      const { channels, userinfo } = await fetchAccountIdentity(accessToken);
      const profile: AccountProfile | null = mapChannelToProfile(channels, userinfo);
      if (!profile) throw new Error('Impossible d’identifier ce compte YouTube.');
      storeToken(profile.accountId, accessToken, expiresInS);
      await saveAccount(profile);
      this.accounts = await listAccounts();
      this.activeId = profile.accountId;
      setActiveAccountId(profile.accountId);
      return this.accounts.find((a) => a.accountId === profile.accountId)!;
    } finally {
      this.connecting = false;
    }
  }
}

export const session = new Session();
