/**
 * Read-only list of the participant’s locos (no selection).
 * Shared by WlanMaus and Railbox finish screens; titles come from i18n keys.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { Vehicle } from "../../../api/types";
import { ChoiceList, ChoiceOption } from "../../ChoiceList";

export default function LocoListStep({
  titleKey,
  hintKey,
  vehicles,
  onDone,
}: {
  titleKey: string;
  hintKey: string;
  vehicles: Vehicle[] | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t(titleKey)}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t(hintKey)}
      </Typography>
      {vehicles === null ? (
        <CircularProgress />
      ) : vehicles.length === 0 ? (
        <Alert severity="info">{t("drive.noLocos")}</Alert>
      ) : (
        <ChoiceList maxHeight={420}>
          {vehicles.map((v) => (
            <ChoiceOption
              key={v.id}
              selected={false}
              onClick={() => {}}
              primary={v.name}
              secondary={
                v.dccAddress != null
                  ? t("drive.locoAddress", { address: v.dccAddress })
                  : t("drive.locoNoAddress")
              }
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}
