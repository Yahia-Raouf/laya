import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

type AuthState = {
  loading: boolean;
  authenticated: boolean;
  username?: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | undefined>();

  useEffect(() => {
    api
      .session()
      .then((s) => {
        setAuthenticated(s.authenticated);
        setUsername(s.username);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  async function login(u: string, p: string) {
    const r = await api.login(u, p);
    setAuthenticated(true);
    setUsername(r.username);
  }

  async function logout() {
    await api.logout().catch(() => {});
    setAuthenticated(false);
    setUsername(undefined);
  }

  return (
    <Ctx.Provider value={{ loading, authenticated, username, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
