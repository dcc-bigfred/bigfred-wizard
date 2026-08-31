/**
 * Pick a scanned wireless-programmer candidate (WiFred / LongFred / Z21).
 * Shared by the programming flow and Fred’s Z21 discovery screen.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { Candidate } from "../../../api/wireless";
import { ChoiceList, ChoiceOption } from "../../ChoiceList";

export default function ScanStep({
  candidates,
  busy,
  selected,
  onSelect,
  onRetry,
  onBack,
  title,
  empty,
  busyText,
}: {
  candidates: Candidate[] | null;
  busy: boolean;
  selected: Candidate | null;
  onSelect: (c: Candidate) => void;
  onRetry: () => void;
  onBack: () => void;
  title?: string;
  empty?: string;
  busyText?: string;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {title ?? t("drive.program.scanTitle")}
      </Typography>
      {busy || candidates === null ? (
        <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
          <CircularProgress />
          <Typography color="text.secondary">{busyText ?? t("drive.program.scanBusy")}</Typography>
        </Stack>
      ) : candidates.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {empty ?? t("drive.program.scanEmpty")}
        </Alert>
      ) : (
        <ChoiceList>
          {candidates.map((c) => (
            <ChoiceOption
              key={`${c.driver}:${c.key}`}
              selected={selected?.key === c.key && selected.driver === c.driver}
              onClick={() => onSelect(c)}
              primary={c.label}
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack} disabled={busy}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onRetry} disabled={busy}>
          {t("drive.program.scanRetry")}
        </Button>
      </Stack>
    </Box>
  );
}
