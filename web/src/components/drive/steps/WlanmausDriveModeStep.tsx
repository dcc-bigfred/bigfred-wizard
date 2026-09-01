/**
 * WlanMaus: after pairing, numbered steps to switch the handset to drive mode.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";
import { WLANMAUS_STEP_COMPONENTS } from "../i18nComponents";

export default function WlanmausDriveModeStep({
  onBack,
  onContinue,
  busy,
}: {
  onBack: () => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const steps: NumberedStep[] = Array.from({ length: 5 }, (_, i) => ({
    body: (
      <Trans i18nKey={`drive.wlanmaus.driveModeSteps.${i + 1}`} components={WLANMAUS_STEP_COMPONENTS} />
    ),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.wlanmaus.driveModeTitle")}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={busy} onClick={onContinue}>
          {busy ? <CircularProgress size={22} color="inherit" /> : t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
