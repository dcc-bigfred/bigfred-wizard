/**
 * After pairing: pick one roster loco to enter on the throttle.
 * Used by generic WiThrottle and withrottle-advanced flows.
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

export default function PickLocoStep({
  vehicles,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  vehicles: Vehicle[] | null;
  selected: Vehicle | null;
  onSelect: (v: Vehicle) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.pickLoco")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t("drive.pickLocoHint")}
      </Typography>
      {vehicles === null ? (
        <CircularProgress />
      ) : vehicles.length === 0 ? (
        <Alert severity="info">{t("drive.noLocos")}</Alert>
      ) : (
        <ChoiceList maxHeight={380}>
          {vehicles.map((v) => (
            <ChoiceOption
              key={v.id}
              selected={selected?.id === v.id}
              onClick={() => onSelect(v)}
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
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={!selected} onClick={onNext}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
