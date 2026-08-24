import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { useErrorText } from "../ErrorAlert";

/** Organizer-auth Wi‑Fi join QR (`WIFI:…`) as a blob URL. */
export default function WifiJoinQr() {
  const { t } = useTranslation();
  const describe = useErrorText();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    api
      .wifiQrSvg()
      .then((blob) => {
        const created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        objectUrl = created;
        setUrl(created);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reload]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !url) {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error ? describe(error) : t("drive.program.wifiMissing")}
        </Alert>
        <Button variant="outlined" onClick={() => setReload((n) => n + 1)}>
          {t("app.retry")}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ textAlign: "center", mb: 2 }}>
      <Box
        component="img"
        src={url}
        alt={t("drive.wifi.qrAlt")}
        sx={{
          width: { xs: 240, sm: 320 },
          height: { xs: 240, sm: 320 },
          bgcolor: "#fff",
          p: 1,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
        }}
      />
    </Box>
  );
}
