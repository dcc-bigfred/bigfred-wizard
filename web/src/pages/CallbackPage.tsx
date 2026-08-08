import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import AppShell from "../components/AppShell";
import ErrorAlert from "../components/ErrorAlert";
import { api, STATE_KEY } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { ready, redirectUri, adoptToken } = useAuth();
  const [error, setError] = useState<unknown>(null);
  // StrictMode double-invokes effects; an OAuth code is single-use.
  const exchanged = useRef(false);

  useEffect(() => {
    if (!ready || exchanged.current) {
      return;
    }
    const code = params.get("code");
    const state = params.get("state");
    const expected = sessionStorage.getItem(STATE_KEY);
    if (!code) {
      setError(new Error(t("login.failed")));
      return;
    }
    if (expected && state !== expected) {
      setError(new Error(t("login.stateMismatch")));
      return;
    }
    exchanged.current = true;
    sessionStorage.removeItem(STATE_KEY);
    api
      .exchangeCode(code, redirectUri, state ?? undefined)
      .then((res) => adoptToken(res.accessToken))
      .then(() => navigate("/", { replace: true }))
      .catch((err) => setError(err));
  }, [ready, params, redirectUri, adoptToken, navigate, t]);

  return (
    <AppShell>
      <Paper sx={{ p: 5, textAlign: "center" }}>
        {error ? (
          <>
            <Typography variant="h5" gutterBottom>
              {t("login.failed")}
            </Typography>
            <ErrorAlert error={error} />
            <Button variant="contained" onClick={() => navigate("/login", { replace: true })}>
              {t("app.retry")}
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h5" gutterBottom>
              {t("login.callback")}
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          </>
        )}
      </Paper>
    </AppShell>
  );
}
