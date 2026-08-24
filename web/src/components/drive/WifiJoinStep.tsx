import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import type { HandsetSetup } from "../../api/types";
import NumberedSteps, { type NumberedStep } from "../NumberedSteps";
import StepNav from "../StepNav";
import WifiCredentials from "./WifiCredentials";
import { wifiPasswordDisplay, wifiSsidDisplay } from "./wifi";

export type WifiJoinVariant = "howto" | "credentials";

interface Props {
  variant: WifiJoinVariant;
  title: string;
  hint?: string;
  setup: HandsetSetup | null;
  setupLoading: boolean;
  continueLabel: string;
  continueDisabled?: boolean;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * Shared Wi‑Fi join screen: either numbered phone how-to, or credentials-only
 * (non-standard handset — we show SSID/PSK but do not explain the device UI).
 */
export default function WifiJoinStep({
  variant,
  title,
  hint,
  setup,
  setupLoading,
  continueLabel,
  continueDisabled,
  onContinue,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const ssid = wifiSsidDisplay(setup);
  const password = wifiPasswordDisplay(setup, t("drive.wifi.openNetwork"));
  const ready = !setupLoading && setup != null;

  const howtoSteps: NumberedStep[] = [1, 2, 3].map((n) => ({
    body: (
      <Trans
        i18nKey={`drive.phone.wifiSteps.${n}`}
        values={{ ssid, password }}
        components={{ strong: <strong /> }}
      />
    ),
  }));

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

      {variant === "howto" ? (
        setupLoading || !setup ? (
          <WifiCredentials setup={setup} loading={setupLoading} />
        ) : (
          <NumberedSteps steps={howtoSteps} />
        )
      ) : (
        <WifiCredentials setup={setup} loading={setupLoading} size="lg" />
      )}

      <StepNav
        onBack={onBack}
        onNext={onContinue}
        nextLabel={continueLabel}
        nextDisabled={!ready || continueDisabled}
      />
    </Box>
  );
}
