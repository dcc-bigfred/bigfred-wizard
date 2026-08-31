/**
 * Phone flow: QR to install the Android app or open the BigFred web UI.
 * Falls back to a warning when `androidAppUrl` is unset.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { WizardConfig } from "../../../api/types";
import type { DriveDevice } from "../../../drive/devices";

export default function PhoneQrStep({
  device,
  config,
  onNext,
  onCancel,
}: {
  device: DriveDevice;
  config: WizardConfig | null;
  onNext: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const androidUrl = config?.androidAppUrl?.trim() ?? "";
  const useAndroidQr = device === "android" && androidUrl !== "";
  const target = useAndroidQr ? "android" : "bigfred";
  const urlMissing = device === "android" && config != null && androidUrl === "";

  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t(device === "android" ? "drive.phone.scanPlayTitle" : "drive.phone.scanWebTitle")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t(device === "android" ? "drive.phone.scanPlayLead" : "drive.phone.scanWebLead")}
      </Typography>
      {urlMissing ? (
        <Alert severity="warning" sx={{ textAlign: "left", mb: 3 }}>
          {t("errors.qr_url_unset")}
        </Alert>
      ) : (
        <Box
          component="img"
          src={`/api/v1/wizard/qr.svg?target=${target}`}
          alt={t("drive.phone.qrAlt")}
          sx={{
            width: { xs: 240, sm: 320 },
            height: { xs: 240, sm: 320 },
            bgcolor: "#fff",
            p: 1,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
          }}
        />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {useAndroidQr ? androidUrl : (config?.bigfredPublicUrl ?? "http://bigfred.local:8080")}
      </Typography>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onCancel}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onNext} disabled={urlMissing}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
