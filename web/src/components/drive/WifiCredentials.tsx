import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { HandsetSetup } from "../../api/types";
import { wifiPasswordDisplay, wifiSsidDisplay } from "./wifi";

interface Props {
  setup: HandsetSetup | null;
  loading: boolean;
  /** Kiosk-sized values for club-event screens. */
  size?: "md" | "lg";
}

/** SSID + PSK from wizard config, shown in plain text. */
export default function WifiCredentials({ setup, loading, size = "md" }: Props) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!setup) {
    return null;
  }

  const ssid = wifiSsidDisplay(setup);
  const password = wifiPasswordDisplay(setup, t("drive.wifi.openNetwork"));
  const valueSx =
    size === "lg"
      ? { fontSize: { xs: "1.5rem", sm: "2rem" }, fontWeight: 800, letterSpacing: 0.4 }
      : { fontSize: "1.15rem", fontWeight: 700 };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography color="text.secondary" sx={{ mb: 0.5 }}>
        {t("drive.wifi.ssid")}
      </Typography>
      <Typography sx={{ ...valueSx, mb: 2 }}>{ssid}</Typography>
      <Typography color="text.secondary" sx={{ mb: 0.5 }}>
        {t("drive.wifi.password")}
      </Typography>
      <Typography sx={valueSx}>{password}</Typography>
    </Box>
  );
}
