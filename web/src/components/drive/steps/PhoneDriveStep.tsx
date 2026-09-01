/**
 * Last phone-flow screen: numbered steps for driving from the phone.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";

export default function PhoneDriveStep({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const steps: NumberedStep[] = [1, 2, 3, 4].map((n) => ({
    body: t(`drive.phone.driveSteps.${n}`),
  }));
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.phone.driveTitle")}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}
