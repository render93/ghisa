import { goto } from '$app/navigation';
import { base } from '$app/paths';

export function nav(path: string) {
  return goto(`${base}${path}`);
}

export function relPath(pathname: string): string {
  if (!base) return pathname;
  if (pathname === base) return '/';
  if (pathname.startsWith(base + '/')) return pathname.slice(base.length);
  return pathname;
}
