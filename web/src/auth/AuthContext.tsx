import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { api, getToken, setToken, STATE_KEY } from "../api/client";
import type { Me, WizardConfig } from "../api/types";

interface AuthValue {
  config: WizardConfig | null;
  configError: string | null;
  ready: boolean;
  token: string | null;
  me: Me | null;
  redirectUri: string;
  startSso: (layoutId: number) => void;
  adoptToken: (token: string) => Promise<void>;
  logout: (reason?: "idle" | "manual") => void;
  idleReason: "idle" | null;
  clearIdleReason: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Picks the configured redirect URI matching this origin, so a hub
 * reachable both as bigfred.local and localhost keeps working. */
function pickRedirectUri(config: WizardConfig | null): string {
  const fallback = `${window.location.origin}/auth/callback`;
  if (!config) {
    return fallback;
  }
  return config.redirectUris.find((uri) => uri.startsWith(window.location.origin)) ?? fallback;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<WizardConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [me, setMe] = useState<Me | null>(null);
  const [idleReason, setIdleReason] = useState<"idle" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .wizardConfig()
      .then((cfg) => {
        if (!cancelled) {
          setConfig(cfg);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setConfigError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(
    (reason: "idle" | "manual" = "manual") => {
      setToken(null);
      setTokenState(null);
      setMe(null);
      setIdleReason(reason === "idle" ? "idle" : null);
      navigate("/login", { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((value) => {
        if (!cancelled) {
          setMe(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          logout("manual");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  // Idle logout: the tablet stays on the login screen between guests.
  useEffect(() => {
    const seconds = config?.idleTimeoutSecs ?? 0;
    if (!token || seconds <= 0) {
      return;
    }
    let timer = window.setTimeout(() => logout("idle"), seconds * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => logout("idle"), seconds * 1000);
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [config, token, logout]);

  const redirectUri = useMemo(() => pickRedirectUri(config), [config]);

  const startSso = useCallback(
    (layoutId: number) => {
      if (!config || !layoutId) {
        return;
      }
      const state = randomState();
      sessionStorage.setItem(STATE_KEY, state);
      const params = new URLSearchParams({
        client_id: config.ssoClientId,
        redirect_uri: redirectUri,
        state,
        response_type: "code",
        layout_id: String(layoutId),
      });
      window.location.assign(
        `${config.bigfredPublicUrl}/api/v1/auth/oauth/authorize?${params.toString()}`,
      );
    },
    [config, redirectUri],
  );

  const adoptToken = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    setTokenState(accessToken);
    setMe(await api.me());
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      config,
      configError,
      ready,
      token,
      me,
      redirectUri,
      startSso,
      adoptToken,
      logout,
      idleReason,
      clearIdleReason: () => setIdleReason(null),
    }),
    [config, configError, ready, token, me, redirectUri, startSso, adoptToken, logout, idleReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
