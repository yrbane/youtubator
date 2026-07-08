/**
 * Configuration embarquée de l'instance.
 *
 * DEFAULT_CLIENT_ID : Client ID OAuth Google fourni par l'hébergeur de
 * l'instance, pour que les visiteurs se connectent « juste avec leur compte
 * Google », sans passer par la console. Un Client ID est PUBLIC par
 * conception (il est visible dans toute app web qui utilise Google Sign-In) :
 * il est protégé par la liste des « origines JavaScript autorisées » du
 * projet Google, pas par le secret. '' = pas d'ID par défaut, chaque
 * utilisateur colle le sien dans ⚙ Réglages (comportement historique).
 */
export const DEFAULT_CLIENT_ID =
  '302756381690-us9aclrk987tlgf4kcn4h40ho5sics3t.apps.googleusercontent.com';

/** Résolution : l'ID collé par l'utilisateur prime sur celui de l'instance. */
export function resolveClientId(stored: string | null, fallback: string = DEFAULT_CLIENT_ID): string | null {
  if (stored && stored.trim() !== '') return stored;
  return fallback.trim() === '' ? null : fallback;
}
