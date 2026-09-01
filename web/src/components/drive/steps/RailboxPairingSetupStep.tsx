/**
 * Railbox: numbered steps to prepare the app for Z21 pairing.
 * Next is disabled until command stations have loaded.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import { useErrorText } from "../../ErrorAlert";
import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";

export default function RailboxPairingSetupStep({
  onBack,
  onContinue,
  stationsLoading,
  stationsError,
  onRetryStations,
}: {
  onBack: () => void;
  onContinue: () => void;
  stationsLoading: boolean;
  stationsError?: unknown;
  onRetryStations?: () => void;
}) {
  const { t } = useTranslation();
  const describe = useErrorText();
  const steps: NumberedStep[] = Array.from({ length: 7 }, (_, i) => ({
    body: t(`drive.railbox.pairSetupSteps.${i + 1}`),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.railbox.pairSetupTitle")}
      </Typography>
      <NumberedSteps steps={steps} />
      {stationsError ? (
        <Box sx={{ mt: 3 }}>
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
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button
          variant="contained"
          disabled={stationsLoading || stationsError != null}
          onClick={onContinue}
        >
          {stationsLoading ? <CircularProgress size={22} color="inherit" /> : t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
