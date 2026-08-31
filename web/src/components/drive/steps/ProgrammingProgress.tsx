/**
 * Live progress for a wireless-programmer job (queued → writing → done).
 * Used by WiFred, LongFred, and Fred programming.
 */
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { JobFrame, JobState } from "../../../api/wireless";

export default function ProgrammingProgress({ frame }: { frame: JobFrame | null }) {
  const { t } = useTranslation();
  const state: JobState = frame?.state ?? "queued";
  const progress = frame?.progress ?? (state === "done" ? 100 : undefined);
  return (
    <Box sx={{ textAlign: "center", py: 2 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.program.programmingTitle")}
      </Typography>
      <CircularProgress sx={{ mb: 3 }} />
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t(`drive.program.programmingStates.${state}`)}
      </Typography>
      {progress != null ? (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 10, borderRadius: 1, mb: 1 }}
        />
      ) : (
        <LinearProgress sx={{ height: 10, borderRadius: 1, mb: 1 }} />
      )}
    </Box>
  );
}
