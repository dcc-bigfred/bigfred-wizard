/**
 * Device-specific “how to select this loco on the handset” numbered steps.
 * Copy is keyed by `howToEnterKey(device)` (WlanMaus, Railbox, FRED, …).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { Vehicle } from "../../../api/types";
import { howToEnterKey, WLANMAUS_ASSETS, type DriveDevice } from "../../../drive/devices";
import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";

export default function HowToEnterStep({
  device,
  loco,
  onDone,
}: {
  device: DriveDevice;
  loco: Vehicle;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const key = howToEnterKey(device);
  const address = loco.dccAddress ?? "—";
  const steps: NumberedStep[] = [1, 2, 3].map((n) => ({
    body: t(`drive.howToEnter.${key}.${n}`, {
      name: loco.name,
      address: String(address),
    }),
    imageSrc: key === "wlanmaus" && n === 1 ? WLANMAUS_ASSETS.selectLoco : undefined,
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.howToEnterTitle", { name: loco.name })}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}
