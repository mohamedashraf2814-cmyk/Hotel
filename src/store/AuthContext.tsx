import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { checkCredentials, isSignedIn, signIn, signOut } from '../lib/auth';
import Login from '../pages/Login';

interface AuthApi {
  logout: () => void;
}

const Ctx = createContext<AuthApi | null>(null);

/** Shows the Merak sign-in screen until the user signs in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isSignedIn());

  const login = useCallback((username: string, password: string, remember: boolean) => {
    if (!checkCredentials(username, password)) return false;
    signIn(remember);
    setAuthed(true);
    return true;
  }, []);

  const logout = useCallback(() => {
    signOut();
    setAuthed(false);
  }, []);

  const api = useMemo(() => ({ logout }), [logout]);
  if (!authed) return <Login onLogin={login} />;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthGate');
  return v;
}
