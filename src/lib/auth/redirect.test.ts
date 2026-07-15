import { describe, expect, it } from 'vitest';
import { authRedirectUrl } from './redirect';

describe('authRedirectUrl', () => {
  it('redirects a local magic link to the current app origin', () => {
    expect(authRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/');
  });

  it('does not duplicate the trailing slash', () => {
    expect(authRedirectUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
  });
});
