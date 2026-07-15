import { base } from '$app/paths';

export function authRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${base}/`;
}
