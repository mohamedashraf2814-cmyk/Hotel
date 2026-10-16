/**
 * Front-end access gate for Merak.
 *
 * IMPORTANT: this is a convenience lock for a shared front desk, NOT real security.
 * Everything runs in the browser, so anyone with the code or the browser's dev tools
 * can bypass it. Only a "signed in" flag is stored — never the password.
 */
export const AUTH_USERNAME = 'merak';
const AUTH_PASSWORD = '123456';
const KEY = 'merak:session:v2';

export function checkCredentials(username: string, password: string): boolean {
  return username.trim().toLowerCase() === AUTH_USERNAME && password === AUTH_PASSWORD;
}

function stores(): Storage[] {
  const out: Storage[] = [];
  try {
    out.push(window.sessionStorage);
  } catch {
    /* unavailable */
  }
  try {
    out.push(window.localStorage);
  } catch {
    /* unavailable */
  }
  return out;
}

export function isSignedIn(): boolean {
  return stores().some((s) => {
    try {
      return s.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
}

/** remember = keep the session after the browser is closed (localStorage), otherwise until the tab closes. */
export function signIn(remember: boolean): void {
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(KEY, '1');
  } catch {
    /* the in-memory React state still lets the user in for this visit */
  }
}

export function signOut(): void {
  for (const s of stores()) {
    try {
      s.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
