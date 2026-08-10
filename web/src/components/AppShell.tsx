import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import LogoutIcon from "@mui/icons-material/Logout";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  LANGUAGE_FLAG_ICONS,
  LANGUAGE_LABELS,
  setLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from "../i18n";
import { useAuth } from "../auth/AuthContext";
import AssistantBackdrop from "./AssistantBackdrop";

interface Props {
  title?: string;
  showBack?: boolean;
  children: ReactNode;
}

function activeLanguage(resolved: string | undefined): Language {
  const code = (resolved ?? "pl").split("-")[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as Language)
    : "pl";
}

export default function AppShell({ title, showBack = false, children }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const current = activeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <AssistantBackdrop />
      <AppBar position="static" color="primary" enableColorOnDark sx={{ position: "relative", zIndex: 1 }}>
        <Toolbar sx={{ gap: 2, minHeight: 80 }}>
          {showBack && (
            <Button color="inherit" startIcon={<ArrowBackIcon />} onClick={() => navigate("/")}>
              {t("app.home")}
            </Button>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {title ?? t("app.title")}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={current}
            onChange={(_, value: Language | null) => value && setLanguage(value)}
            aria-label={t("app.language")}
            sx={{ bgcolor: "rgba(255,255,255,0.15)", borderRadius: 2 }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const Flag = LANGUAGE_FLAG_ICONS[lang];
              return (
                <ToggleButton
                  key={lang}
                  value={lang}
                  aria-label={LANGUAGE_LABELS[lang]}
                  title={LANGUAGE_LABELS[lang]}
                  sx={{ color: "white", px: 1.25, minWidth: 48, lineHeight: 0 }}
                >
                  <Flag
                    aria-hidden
                    sx={{ fontSize: 28, borderRadius: 0.5, overflow: "hidden" }}
                  />
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
          <Button
            color="inherit"
            startIcon={fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? t("app.exitFullscreen") : t("app.fullscreen")}
          </Button>
          {token && (
            <Button
              color="inherit"
              aria-label={t("app.logout")}
              title={t("app.logout")}
              onClick={() => logout()}
              sx={{ minWidth: 64, px: 1.5 }}
            >
              <LogoutIcon />
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ position: "relative", zIndex: 1, py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
