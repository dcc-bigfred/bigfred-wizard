import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import BackspaceIcon from "@mui/icons-material/Backspace";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  maxLength?: number;
  /** Renders dots instead of digits (PIN entry). */
  mask?: boolean;
  /** Show a reveal toggle when `mask` is true. */
  allowReveal?: boolean;
  helperText?: string;
  error?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const keySx = {
  fontSize: "1.6rem",
  bgcolor: "grey.100",
  border: "1px solid",
  borderColor: "grey.300",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
  "&:hover": {
    bgcolor: "grey.200",
    borderColor: "grey.400",
  },
  "&:active": {
    bgcolor: "grey.300",
  },
} as const;

export default function NumericKeypad({
  value,
  onChange,
  label,
  maxLength = 6,
  mask = false,
  allowReveal = false,
  helperText,
  error = false,
}: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const effectiveMask = mask && !(allowReveal && revealed);

  const push = (digit: string) => {
    if (value.length >= maxLength) {
      return;
    }
    onChange(value + digit);
  };

  const display = effectiveMask ? "•".repeat(value.length) : value;

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        {label}
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          py: 2,
          mb: 1,
          textAlign: "center",
          fontSize: "2.5rem",
          letterSpacing: effectiveMask ? "0.4em" : "0.15em",
          minHeight: 72,
          borderColor: error ? "error.main" : undefined,
          bgcolor: "grey.50",
        }}
      >
        {display || "\u00a0"}
      </Paper>
      {mask && allowReveal && (
        <Button
          variant="outlined"
          fullWidth
          startIcon={revealed ? <VisibilityOffIcon /> : <VisibilityIcon />}
          onClick={() => setRevealed((v) => !v)}
          sx={{
            mb: 2,
            bgcolor: "grey.100",
            borderColor: "grey.300",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
            "&:hover": { bgcolor: "grey.200", borderColor: "grey.400" },
          }}
        >
          {revealed ? t("account.hidePin") : t("account.showPin")}
        </Button>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1.5,
        }}
      >
        {KEYS.map((key) => (
          <Button key={key} variant="outlined" sx={keySx} onClick={() => push(key)}>
            {key}
          </Button>
        ))}
        <Button
          variant="outlined"
          color="warning"
          sx={{
            ...keySx,
            bgcolor: "warning.light",
            borderColor: "warning.main",
            color: "warning.contrastText",
            "&:hover": { bgcolor: "warning.main", color: "warning.contrastText" },
          }}
          onClick={() => onChange("")}
        >
          C
        </Button>
        <Button variant="outlined" sx={keySx} onClick={() => push("0")}>
          0
        </Button>
        <Button variant="outlined" sx={keySx} onClick={() => onChange(value.slice(0, -1))}>
          <BackspaceIcon />
        </Button>
      </Box>
      {helperText && (
        <Typography variant="body2" color={error ? "error" : "text.secondary"} sx={{ mt: 1.5 }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
