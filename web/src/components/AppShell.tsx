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
import SettingsIcon from "@mui/icons-material/Settings";
import Fab from "@mui/material/Fab";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

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
  const location = useLocation();
  const { token, logout } = useAuth();
  const current = activeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const onAbout = location.pathname === "/about";
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
        minHeight: "100dvh",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        bgcolor: "background.default",
      }}
    >
      <AssistantBackdrop />
      <AppBar position="static" color="primary" enableColorOnDark sx={{ position: "relative", zIndex: 1 }}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 1.5 }, minHeight: 64, px: { xs: 1, sm: 2 } }}>
          {showBack && (
            <Button
              color="inherit"
              aria-label={t("app.home")}
              title={t("app.home")}
              onClick={() => navigate("/")}
              sx={{ minWidth: 40, px: { xs: 1, sm: 1.5 } }}
            >
              <ArrowBackIcon sx={{ mr: { xs: 0, sm: 1 } }} />
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {t("app.home")}
              </Box>
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
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
                  sx={{ color: "white", px: { xs: 0.75, sm: 1.25 }, minWidth: { xs: 40, sm: 48 }, lineHeight: 0 }}
                >
                  <Flag
                    aria-hidden
                    sx={{ fontSize: { xs: 22, sm: 28 }, borderRadius: 0.5, overflow: "hidden" }}
                  />
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
          <Button
            color="inherit"
            aria-label={fullscreen ? t("app.exitFullscreen") : t("app.fullscreen")}
            title={fullscreen ? t("app.exitFullscreen") : t("app.fullscreen")}
            onClick={() => void toggleFullscreen()}
            sx={{ minWidth: 40, px: 1 }}
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </Button>
        </Toolbar>
      </AppBar>
      <Container
        maxWidth="md"
        sx={{
          position: "relative",
          zIndex: 1,
          py: 4,
          width: "100%",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      >
        {title && (
          <Typography
            component="h1"
            variant="h5"
            align="center"
            sx={{ mb: 3, fontWeight: 600 }}
          >
            {title}
          </Typography>
        )}
        {children}
      </Container>
      <Box
        sx={{
          position: "fixed",
          left: { xs: 12, sm: 20 },
          bottom: { xs: 12, sm: 20 },
          zIndex: 20,
          display: "flex",
          gap: 1,
        }}
      >
        {!onAbout && (
          <Fab
            color="primary"
            size="small"
            aria-label={t("about.open")}
            title={t("about.open")}
            onClick={() => navigate("/about")}
            sx={{
              width: 28,
              height: 28,
              minHeight: 28,
              opacity: 0.5,
              "& .MuiSvgIcon-root": { fontSize: 16 },
            }}
          >
            <SettingsIcon />
          </Fab>
        )}
        {token && (
          <Fab
            color="primary"
            size="small"
            aria-label={t("app.logout")}
            title={t("app.logout")}
            onClick={() => logout()}
            sx={{
              width: 28,
              height: 28,
              minHeight: 28,
              opacity: 0.5,
              "& .MuiSvgIcon-root": { fontSize: 16 },
            }}
          >
            <LogoutIcon />
          </Fab>
        )}
      </Box>
    </Box>
  );
}
