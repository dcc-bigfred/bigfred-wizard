import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import BackspaceIcon from "@mui/icons-material/Backspace";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  maxLength?: number;
  /** Renders dots instead of digits (PIN entry). */
  mask?: boolean;
  helperText?: string;
  error?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function NumericKeypad({
  value,
  onChange,
  label,
  maxLength = 6,
  mask = false,
  helperText,
  error = false,
}: Props) {
  const push = (digit: string) => {
    if (value.length >= maxLength) {
      return;
    }
    onChange(value + digit);
  };

  const display = mask ? "•".repeat(value.length) : value;

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        {label}
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          py: 2,
          mb: 2,
          textAlign: "center",
          fontSize: "2.5rem",
          letterSpacing: mask ? "0.4em" : "0.15em",
          minHeight: 72,
          borderColor: error ? "error.main" : undefined,
        }}
      >
        {display || "\u00a0"}
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1.5,
        }}
      >
        {KEYS.map((key) => (
          <Button key={key} variant="outlined" sx={{ fontSize: "1.6rem" }} onClick={() => push(key)}>
            {key}
          </Button>
        ))}
        <Button variant="outlined" color="warning" onClick={() => onChange("")}>
          C
        </Button>
        <Button variant="outlined" sx={{ fontSize: "1.6rem" }} onClick={() => push("0")}>
          0
        </Button>
        <Button variant="outlined" onClick={() => onChange(value.slice(0, -1))}>
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
