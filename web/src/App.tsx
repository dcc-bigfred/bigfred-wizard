import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import AppShell from "./components/AppShell";
import { HelpProvider } from "./help/HelpContext";
import HelpOverlay from "./help/HelpOverlay";
import AboutPage from "./pages/AboutPage";
import CallbackPage from "./pages/CallbackPage";
import CreateAccountPage from "./pages/CreateAccountPage";
import ConfigureLocoPage from "./pages/ConfigureLocoPage";
import DriveFlowPage from "./pages/DriveFlowPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";

function Protected({ children }: { children: ReactNode }) {
  const { ready, token, config } = useAuth();
  const { t } = useTranslation();

  if (!ready) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (config && !config.enabled) {
    return (
      <AppShell>
        <Alert severity="warning" sx={{ fontSize: "1.1rem" }}>
          <strong>{t("app.disabled")}</strong>
          <div>{t("app.disabledHint")}</div>
        </Alert>
      </AppShell>
    );
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <HomePage />
          </Protected>
        }
      />
      <Route
        path="/flow/account"
        element={
          <Protected>
            <CreateAccountPage />
          </Protected>
        }
      />
      <Route
        path="/flow/drive"
        element={
          <Protected>
            <DriveFlowPage />
          </Protected>
        }
      />
      <Route path="/flow/phone" element={<Navigate to="/flow/drive" replace />} />
      <Route path="/flow/wlanmaus" element={<Navigate to="/flow/drive" replace />} />
      <Route path="/flow/longfred" element={<Navigate to="/flow/drive" replace />} />
      <Route
        path="/flow/loco"
        element={
          <Protected>
            <ConfigureLocoPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HelpProvider>
        <Router />
        <HelpOverlay />
      </HelpProvider>
    </AuthProvider>
  );
}
