import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LoginIcon from "@mui/icons-material/Login";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ready, token, config, configError, startSso, idleReason, clearIdleReason } = useAuth();

  useEffect(() => {
    if (token) {
      navigate("/", { replace: true });
    }
  }, [token, navigate]);

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
        {config && !config.enabled && (
          <Alert severity="warning" sx={{ mb: 3, textAlign: "left" }}>
            <strong>{t("app.disabled")}</strong>
            <div>{t("app.disabledHint")}</div>
          </Alert>
        )}

        {!ready ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={startSso}
            disabled={!config}
            sx={{ px: 6, py: 2, fontSize: "1.3rem" }}
          >
            {t("login.button")}
          </Button>
        )}
      </Paper>
    </AppShell>
  );
}
