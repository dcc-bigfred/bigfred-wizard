import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import NumericKeypad from "./NumericKeypad";

interface Props {
  /** Exact digit count (e.g. 6 for WiFred pairing code). */
  exact?: number;
  /** Inclusive range when length is flexible (e.g. LongFred PIN). */
  minLength?: number;
  maxLength?: number;
  title: string;
  hint?: string;
  continueLabel?: string;
  onSubmit: (pin: string) => void;
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
      <Button
        variant="contained"
        size="large"
        disabled={!ready}
        onClick={() => onSubmit(value)}
      >
        {continueLabel ?? t("drive.program.pinContinue")}
      </Button>
    </Stack>
  );
}
