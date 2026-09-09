// @vitest-environment node
// ---------------------------------------------------------------------------
// v1.0.9 — Google OAuth fix guards:
//   - the shipped client ID is NEVER a hard-coded/dead/fake one; the manifest
//     carries a clearly-marked placeholder in the single config spot
//   - the manifest keeps MV3 + identity + the two OAuth keys (stable "key"
//     for a consistent extension ID, "oauth2" block with only the scopes the
//     extension uses: spreadsheets, drive.readonly, userinfo.email)
//   - the old invalid client id appears nowhere
//   - users never see raw technical errors (invalid_client / 401 /
//     redirect_uri_mismatch / "OAuth client was not found") — only friendly
//     messages with the technical detail kept for the console
//   - connection objects never store tokens (Chrome's identity cache holds
//     them and refreshes automatically)
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  connectionFromSession,
  friendlyAuthMessage,
  isClientConfigured,
  isClientIdConfigured,
  oauthClientId,
} from '../src/services/google/oauth';

const DEAD_CLIENT_ID = '806501874577-8l6q0ftvc47d2j6po1a5jqv97i42sv4o.apps.googleusercontent.com';
const SCOPES_SHIPPED = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

describe('manifest OAuth configuration (the root-cause fix)', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'manifest.json'), 'utf8')) as {
    manifest_version: number;
    permissions?: string[];
    host_permissions?: string[];
    key?: string;
    oauth2?: { client_id?: string; scopes?: string[] };
  };

  it('is Manifest V3 and keeps the identity permission', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('identity');
    expect(manifest.permissions).toContain('storage');
  });

  it('has a stable extension "key" (ID never changes between rebuilds)', () => {
    expect(manifest.key).toBeTruthy();
    expect(manifest.key!.length).toBeGreaterThan(200);
  });

  it('configures the OAuth client in exactly one place: manifest oauth2', () => {
    expect(manifest.oauth2).toBeTruthy();
    expect(manifest.oauth2!.scopes).toEqual(SCOPES_SHIPPED);
  });

  it('does NOT ship the dead/old client id anywhere (root cause)', () => {
    expect(manifest.oauth2!.client_id).not.toBe(DEAD_CLIENT_ID);
    const haystack = [readFileSync(join(__dirname, '..', 'public', 'manifest.json'), 'utf8')];
    const readAllTs = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) readAllTs(p);
        else if (f.name.endsWith('.ts') || f.name.endsWith('.tsx')) haystack.push(readFileSync(p, 'utf8'));
      }
    };
    readAllTs(join(__dirname, '..', 'src'));
    expect(haystack.join('\n')).not.toContain(DEAD_CLIENT_ID);
  });

  it('shipped placeholder is detected as "not configured" (never sent to Google)', () => {
    // inside the extension, oauthClientId() reads the manifest; outside it is ''
    expect(typeof oauthClientId()).toBe('string');
    expect(isClientConfigured()).toBe(false);
    expect(isClientIdConfigured('')).toBe(false);
    expect(isClientIdConfigured('PASTE_YOUR_GOOGLE_CLIENT_ID_HERE')).toBe(false);
  });
});

describe('client id validation (single central config)', () => {
  it('accepts only real Chrome-Extension OAuth client ids', () => {
    expect(isClientIdConfigured('123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com')).toBe(true);
    expect(isClientIdConfigured(DEAD_CLIENT_ID)).toBe(true); // format-wise valid (but never shipped)
    expect(isClientIdConfigured('not-a-client-id')).toBe(false);
    expect(isClientIdConfigured('PASTE_YOUR_GOOGLE_CLIENT_ID_HERE')).toBe(false);
    expect(isClientIdConfigured('')).toBe(false);
  });
});

describe('users never see raw OAuth errors', () => {
  it('maps every auth problem to a friendly message without technical leakage', () => {
    const messages = [
      friendlyAuthMessage('auth_required'),
      friendlyAuthMessage('unknown'),
      friendlyAuthMessage('not_configured'),
      friendlyAuthMessage('user_cancelled'),
      friendlyAuthMessage('auth_required', 'invalid_client: The OAuth client was not found. (401)'),
      friendlyAuthMessage('unknown', 'Error 401: invalid_client / redirect_uri_mismatch'),
      friendlyAuthMessage(undefined, 'The OAuth client was not found.'),
      friendlyAuthMessage(null, 'invalid_client'),
    ];
    for (const m of messages) {
      expect(m.toLowerCase()).not.toContain('invalid_client');
      expect(m).not.toContain('401');
      expect(m).not.toContain('OAuth client was not found');
      expect(m).not.toContain('redirect_uri');
    }
    expect(friendlyAuthMessage('auth_required')).toContain('Google connection expired. Please reconnect your Google Account.');
    expect(friendlyAuthMessage('unknown')).toContain('Please reconnect your Google Account.');
    expect(friendlyAuthMessage('user_cancelled')).toContain('cancelled');
  });
});

describe('tokens are never stored', () => {
  it('a connection object carries metadata only — no access or refresh token', () => {
    const c = connectionFromSession({ email: 'shop@example.com' });
    expect(c.accessToken).toBe('');
    expect(c.refreshToken).toBe('');
    expect(c.tokenExpiresAt).toBe(0);
    expect(c.refreshExpiresAt).toBeNull();
    expect(c.viaOfflineGrant).toBe(false);
    expect(c.email).toBe('shop@example.com');
    expect(c.spreadsheetId).toBe('');
  });
});
