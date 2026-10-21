import { PROJECT_LINKS } from '@/lib/models/application-shell';

/**
 * Disco has no website or hosted documentation yet, so About and help links open
 * the repository, whose README documents the app in every supported language.
 */
export function projectWebsiteUrl(): string {
  return PROJECT_LINKS.website;
}
