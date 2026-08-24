import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useTranslation } from "react-i18next";

interface Props {
  onBack: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextBusy?: boolean;
  showNext?: boolean;
}

/** Back / continue row shared by kiosk flow steps. */
export default function StepNav({
  onBack,
  onNext,
  backLabel,
  nextLabel,
  nextDisabled,
  nextBusy,
  showNext = true,
}: Props) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
      <Button variant="outlined" onClick={onBack}>
        {backLabel ?? t("app.back")}
      </Button>
      {showNext && onNext ? (
        <Button variant="contained" disabled={nextDisabled || nextBusy} onClick={onNext}>
          {nextBusy ? <CircularProgress size={22} color="inherit" /> : (nextLabel ?? t("app.next"))}
        </Button>
      ) : null}
    </Stack>
  );
}
