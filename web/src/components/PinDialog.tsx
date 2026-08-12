import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import NumericKeypad from "./NumericKeypad";

interface Props {
  /** Exact digit count (e.g. fixed-length codes). */
  exact?: number;
  /** Inclusive range when length is flexible (e.g. user PIN). */
  minLength?: number;
  maxLength?: number;
  title: string;
  hint?: string;
  continueLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void | Promise<void>;
}

/**
 * Generic PIN / pairing-code entry for kiosk flows.
 * Reuses NumericKeypad; never mentions technical field names.
 */
export default function PinDialog({
  exact,
  minLength = 4,
  maxLength = 6,
  title,
  hint,
  continueLabel,
  busy = false,
  error = null,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const len = exact ?? maxLength;
  const min = exact ?? minLength;
  const ready = value.length >= min && value.length <= len;

  return (
    <Stack spacing={2} alignItems="stretch" sx={{ maxWidth: 420, mx: "auto" }}>
      <Box>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        {hint ? (
          <Typography variant="body2" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Box>
      <NumericKeypad
        value={value}
        onChange={setValue}
        label=""
        maxLength={len}
        mask
        allowReveal
      />
      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : null}
      <Button
        variant="contained"
        size="large"
        disabled={!ready || busy}
        onClick={() => void onSubmit(value)}
      >
        {busy ? <CircularProgress size={22} color="inherit" /> : continueLabel ?? t("drive.program.pinContinue")}
      </Button>
    </Stack>
  );
}
