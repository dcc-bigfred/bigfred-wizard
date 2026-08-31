/**
 * Pick a command station when the layout has more than one usable CS.
 * Shown after PIN / Wi‑Fi when auto-select of a single station is not possible.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { CommandStation } from "../../../api/types";
import { ChoiceList, ChoiceOption } from "../../ChoiceList";

export default function StationStep({
  stations,
  station,
  onSelect,
  busy,
  onBack,
  onStart,
}: {
  stations: CommandStation[] | null;
  station: CommandStation | null;
  onSelect: (cs: CommandStation) => void;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t("drive.pickStation")}
      </Typography>
      {stations === null ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <ChoiceList>
          {stations.map((cs) => (
            <ChoiceOption
              key={cs.id}
              selected={station?.id === cs.id}
              onClick={() => onSelect(cs)}
              primary={cs.name}
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={!station || busy} onClick={onStart}>
          {t("drive.startPairing")}
        </Button>
      </Stack>
    </Box>
  );
}
