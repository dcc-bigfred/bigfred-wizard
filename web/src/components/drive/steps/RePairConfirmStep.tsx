/**
 * The chosen login already has a live remote session on this station.
 * Keep it (abort this flow) or replace it and start a new pairing.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

export default function RePairConfirmStep({
  busy,
  onKeep,
  onReplace,
}: {
  busy: boolean;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("drive.alreadyPairedTitle")}
      </Typography>
      <Typography sx={{ mb: 3, fontSize: "1.15rem" }}>{t("drive.alreadyPairedAsk")}</Typography>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button variant="outlined" disabled={busy} onClick={onKeep}>
          {t("drive.keepExisting")}
        </Button>
        <Button variant="contained" disabled={busy} onClick={onReplace}>
          {busy ? <CircularProgress size={22} color="inherit" /> : t("drive.replacePairing")}
        </Button>
      </Stack>
    </Box>
  );
}
