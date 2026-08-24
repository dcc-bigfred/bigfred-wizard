import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { HandsetSetup } from "../../api/types";
import { useErrorText } from "../ErrorAlert";
import StepNav from "../StepNav";
import WifiCredentials from "./WifiCredentials";
import WifiJoinQr from "./WifiJoinQr";

export type WifiJoinVariant = "howto" | "credentials";

interface Props {
  variant: WifiJoinVariant;
  title: string;
  hint?: string;
  setup: HandsetSetup | null;
  setupLoading: boolean;
  setupError?: unknown;
  onRetrySetup?: () => void;
  continueLabel: string;
  continueDisabled?: boolean;
  stationsError?: unknown;
  onRetryStations?: () => void;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * Shared Wi‑Fi join screen: QR that adds the network on Android/iPhone,
 * with optional reveal of the network name and password.
 */
export default function WifiJoinStep({
  variant,
  title,
  hint,
  setup,
  setupLoading,
  setupError,
  onRetrySetup,
  continueLabel,
  continueDisabled,
  stationsError,
  onRetryStations,
  onContinue,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const describe = useErrorText();
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setShowManual(false);
  }, [setup]);

  const ready = !setupLoading && setup != null && !setupError;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: hint ? 1 : 3 }}>
        {title}
      </Typography>
      {hint ? (
        <Alert severity="info" sx={{ mb: 3, fontSize: "1.05rem" }}>
          {hint}
        </Alert>
      ) : null}

      {ready ? (
        <>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: "1.1rem" }}>
            {t("drive.wifi.qrLead")}
          </Typography>
          <WifiJoinQr />
          {showManual ? (
            <WifiCredentials
              setup={setup}
              loading={false}
              size={variant === "credentials" ? "lg" : "md"}
            />
          ) : (
            <Button
              variant="outlined"
              onClick={() => setShowManual(true)}
              sx={{
                display: "block",
                width: "100%",
                whiteSpace: "normal",
                textAlign: "center",
                py: 1.5,
                mb: 1,
              }}
            >
              {t("drive.wifi.showManual")}
            </Button>
          )}
        </>
      ) : (
        <WifiCredentials
          setup={setup}
          loading={setupLoading}
          size={variant === "credentials" ? "lg" : "md"}
          error={setupError}
          onRetry={onRetrySetup}
        />
      )}

      {stationsError ? (
        <Box sx={{ mt: 2 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {describe(stationsError)}
          </Alert>
          {onRetryStations ? (
            <Button variant="outlined" onClick={onRetryStations}>
              {t("app.retry")}
            </Button>
          ) : null}
        </Box>
      ) : null}

      <StepNav
        onBack={onBack}
        onNext={onContinue}
        nextLabel={continueLabel}
        nextDisabled={setupLoading || continueDisabled}
      />
    </Box>
  );
}
