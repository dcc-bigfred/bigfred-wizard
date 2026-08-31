/**
 * Railbox: QR to install the Railbox app from the Play Store.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

export default function RailboxAppQrStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.railbox.appQrTitle")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("drive.railbox.appQrLead")}
      </Typography>
      <Box
        component="img"
        src="/api/v1/wizard/qr.svg?target=railbox"
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
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onNext}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
