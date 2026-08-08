import type { ReactNode } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LogoutIcon from "@mui/icons-material/Logout";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { setLanguage, SUPPORTED_LANGUAGES, type Language } from "../i18n";
import { useAuth } from "../auth/AuthContext";

interface Props {
  title?: string;
  showBack?: boolean;
  children: ReactNode;
}

export default function AppShell({ title, showBack = false, children }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { me, token, logout } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" color="primary" enableColorOnDark>
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
            value={i18n.resolvedLanguage}
            onChange={(_, value: Language | null) => value && setLanguage(value)}
            sx={{ bgcolor: "rgba(255,255,255,0.15)", borderRadius: 2 }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <ToggleButton key={lang} value={lang} sx={{ color: "white", px: 2 }}>
                {lang.toUpperCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {token && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {me ? t("login.loggedInAs", { login: me.login }) : ""}
              </Typography>
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={() => logout()}>
                {t("app.logout")}
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
