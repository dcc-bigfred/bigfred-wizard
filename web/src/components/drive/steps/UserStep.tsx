/**
 * Shared “who is driving?” picker used by most device flows.
 * Busy spinner covers the post-select API call (connect / roster load).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { User } from "../../../api/types";
import UserPicker from "../../UserPicker";

export default function UserStep({
  selected,
  onSelect,
  busy,
  onBack,
  backLabel,
  title,
}: {
  selected: User | null;
  onSelect: (picked: User) => void;
  busy: boolean;
  onBack: () => void;
  backLabel: string;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      {title ? (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      ) : null}
      <UserPicker selected={selected} onSelect={onSelect} />
      {busy && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress />
        </Box>
      )}
      <Stack direction="row" sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={onBack}>
          {backLabel || t("app.cancel")}
        </Button>
      </Stack>
    </Box>
  );
}
