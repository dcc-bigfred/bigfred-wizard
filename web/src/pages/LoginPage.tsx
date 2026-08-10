import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import LoginIcon from "@mui/icons-material/Login";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { api } from "../api/client";
import type { LoginLayout } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const LAYOUT_KEY = "bigfred-wizard.layoutId";

function readStoredLayoutId(): number {
  const raw = sessionStorage.getItem(LAYOUT_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function layoutLabel(layout: LoginLayout, systemLabel: string): string {
  return layout.isSystem ? systemLabel : layout.name;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ready, token, config, configError, startSso, idleReason, clearIdleReason } = useAuth();

  const [layouts, setLayouts] = useState<LoginLayout[] | null>(null);
  const [layoutsError, setLayoutsError] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<number>(readStoredLayoutId);
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    if (token) {
      navigate("/", { replace: true });
    }
  }, [token, navigate]);

  useEffect(() => {
    let cancelled = false;
    api
      .layoutsForLogin()
      .then((list) => {
        if (cancelled) return;
        setLayouts(list);
        setLayoutId((prev) => {
          if (prev && list.some((l) => l.id === prev)) return prev;
          const sys = list.find((l) => l.isSystem);
          return sys?.id ?? list[0]?.id ?? 0;
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setLayoutsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (layoutId > 0) {
      sessionStorage.setItem(LAYOUT_KEY, String(layoutId));
    }
  }, [layoutId]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const layoutOptions = useMemo(() => {
    if (!layouts) return [];
    const systemLabel = t("login.systemLayout");
    return layouts.map((l) => ({
      id: l.id,
      label: layoutLabel(l, systemLabel),
    }));
  }, [layouts, t]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser may deny without a user gesture or policy; ignore.
    }
  };

  const canSignIn =
    Boolean(config) && layoutId > 0 && layouts != null && layouts.length > 0 && !layoutsError;

  return (
    <AppShell>
      <Paper sx={{ p: 5, textAlign: "center" }}>
        <Typography variant="h4" gutterBottom>
          {t("login.heading")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {t("login.lead")}
        </Typography>

        {idleReason === "idle" && (
          <Alert severity="info" sx={{ mb: 3 }} onClose={clearIdleReason}>
            {t("app.idleLogout")}
          </Alert>
        )}
        {configError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {configError}
          </Alert>
        )}
        {layoutsError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {t("login.layoutsError")}
          </Alert>
        )}
        {config && !config.enabled && (
          <Alert severity="warning" sx={{ mb: 3, textAlign: "left" }}>
            <strong>{t("app.disabled")}</strong>
            <div>{t("app.disabledHint")}</div>
          </Alert>
        )}

        {!ready || layouts === null ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2.5} alignItems="stretch" sx={{ maxWidth: 420, mx: "auto" }}>
            <TextField
              select
              label={t("login.layout")}
              value={layoutId === 0 ? "" : String(layoutId)}
              onChange={(e) => setLayoutId(Number(e.target.value))}
              disabled={layoutOptions.length === 0}
              fullWidth
              helperText={t("login.layoutHint")}
            >
              {layoutOptions.map((opt) => (
                <MenuItem key={opt.id} value={String(opt.id)}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <Button
              variant="outlined"
              startIcon={fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              onClick={() => void toggleFullscreen()}
              fullWidth
            >
              {fullscreen ? t("login.exitFullscreen") : t("login.enterFullscreen")}
            </Button>

            <Button
              variant="contained"
              startIcon={<LoginIcon />}
              onClick={() => startSso(layoutId)}
              disabled={!canSignIn}
              sx={{ px: 6, py: 2, fontSize: "1.3rem" }}
            >
              {t("login.button")}
            </Button>
          </Stack>
        )}
      </Paper>
    </AppShell>
  );
}
