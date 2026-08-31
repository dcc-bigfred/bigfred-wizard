/**
 * Wait for BigFred remote pairing: show the code and per-device key steps.
 * Polling lives in the session hook; this screen only renders status + hints.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import type { RemotePairing } from "../../../api/types";
import { pairingDigits, WLANMAUS_ASSETS, type DriveDevice } from "../../../drive/devices";
import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";

function buildPairingSteps(
  device: DriveDevice,
  digits: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): NumberedStep[] {
  const pressSteps: NumberedStep[] = [...digits].map((d) => ({
    body: (
      <Trans
        i18nKey={
          device === "wlanmaus"
            ? "drive.steps.pressWlanmausKey"
            : device === "railbox"
              ? "drive.railbox.pressKey"
              : "drive.steps.pressF"
        }
        values={{ key: d, f: `F${d}` }}
        components={{ strong: <strong /> }}
      />
    ),
    imageSrc: device === "wlanmaus" ? WLANMAUS_ASSETS.functionKeys : undefined,
  }));

  if (device === "wlanmaus" || device === "railbox") {
    return pressSteps;
  }

  if (device === "longfred" || device === "wifred") {
    return [
      { body: t("drive.steps.powerOnHandset") },
      { body: t("drive.steps.openPairingLoco") },
      ...pressSteps,
    ];
  }

  return [
    {
      body: <Trans i18nKey="drive.withrottleAdvanced.pairLoco" components={{ strong: <strong /> }} />,
    },
    ...pressSteps,
    {
      body: (
        <Trans
          i18nKey="drive.withrottleAdvanced.orDeviceName"
          values={{ code: digits }}
          components={{ strong: <strong /> }}
        />
      ),
    },
  ];
}

export default function PairingStep({
  device,
  pairing,
  paired,
  expired,
  busy,
  onCancel,
  onContinue,
  onRetry,
}: {
  device: DriveDevice;
  pairing: RemotePairing;
  paired: boolean;
  expired: boolean;
  busy: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const digits = pairingDigits(pairing);
  const steps = buildPairingSteps(device, digits, t);

  return (
    <Box>
      {paired ? (
        <Alert severity="success" sx={{ mb: 3 }}>
          {t("drive.paired")}
        </Alert>
      ) : expired ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t("drive.expired")}
        </Alert>
      ) : (
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <CircularProgress size={28} />
          <Typography variant="h6">{t("drive.waiting")}</Typography>
        </Stack>
      )}

      {device === "wlanmaus" && (
        <Typography sx={{ mb: 2, fontSize: "1.1rem" }}>{t("drive.wlanmaus.pairingLead")}</Typography>
      )}

      {device === "railbox" && (
        <Typography sx={{ mb: 2, fontSize: "1.1rem" }}>{t("drive.railbox.pairingLead")}</Typography>
      )}

      {device === "withrottle-advanced" && (
        <Typography
          variant="h3"
          sx={{
            mb: 3,
            letterSpacing: 8,
            textAlign: "center",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 800,
          }}
        >
          {digits}
        </Typography>
      )}

      <NumberedSteps steps={steps} />

      {!paired && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          {t("drive.pairingRetryHint")}
        </Alert>
      )}

      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onCancel}>
          {device === "withrottle-advanced" ? t("app.back") : t("app.cancel")}
        </Button>
        {expired ? (
          <Button variant="contained" disabled={busy} onClick={onRetry}>
            {t("drive.startPairing")}
          </Button>
        ) : (
          <Button variant="contained" disabled={!paired || busy} onClick={onContinue}>
            {t("app.next")}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
