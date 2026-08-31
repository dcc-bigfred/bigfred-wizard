/**
 * Railbox: show the Z21 / BigFred IP and numbered connect-in-app steps.
 * Reuses WifiCredentials when handset setup has not loaded yet.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import type { HandsetSetup } from "../../../api/types";
import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";
import WifiCredentials from "../WifiCredentials";

export default function RailboxConnectStep({
  setup,
  setupLoading,
  setupError,
  onRetrySetup,
  onBack,
  onContinue,
}: {
  setup: HandsetSetup | null;
  setupLoading: boolean;
  setupError?: unknown;
  onRetrySetup?: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const z21Ip = setup?.bigfredIpv4 ?? setup?.bigfredHost ?? "—";
  const steps: NumberedStep[] = [1, 2, 3].map((n) => ({
    body: (
      <Trans
        i18nKey={`drive.railbox.connectSteps.${n}`}
        values={{ z21Ip }}
        components={{ strong: <strong /> }}
      />
    ),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.railbox.connectTitle")}
      </Typography>
      {setupLoading ? (
        <CircularProgress sx={{ my: 3 }} />
      ) : setup ? (
        <>
          <Typography sx={{ mb: 2 }}>
            <strong>{t("drive.railbox.connectIp")}:</strong> {z21Ip}
          </Typography>
          <NumberedSteps steps={steps} />
        </>
      ) : (
        <WifiCredentials setup={null} loading={false} error={setupError} onRetry={onRetrySetup} />
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={setupLoading || !setup} onClick={onContinue}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
