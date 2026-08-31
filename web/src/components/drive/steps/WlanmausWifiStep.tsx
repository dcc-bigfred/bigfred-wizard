/**
 * WlanMaus: “is the handset already on the layout Wi‑Fi?”
 * Yes continues to pairing; No reveals SSID/PSK, Z21 IP, and join steps.
 */
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import type { HandsetSetup } from "../../../api/types";
import { DEVICE_OPTIONS } from "../../../drive/devices";
import { useErrorText } from "../../ErrorAlert";
import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";
import { WLANMAUS_STEP_COMPONENTS } from "../i18nComponents";
import WifiCredentials from "../WifiCredentials";
import { wifiPasswordDisplay, wifiSsidDisplay } from "../wifi";

export default function WlanmausWifiStep({
  needsSetup,
  setup,
  setupLoading,
  setupError,
  onRetrySetup,
  stationsLoading,
  stationsError,
  onRetryStations,
  onYes,
  onNo,
  onContinue,
  onBack,
}: {
  needsSetup: boolean | null;
  setup: HandsetSetup | null;
  setupLoading: boolean;
  setupError?: unknown;
  onRetrySetup?: () => void;
  stationsLoading: boolean;
  stationsError?: unknown;
  onRetryStations?: () => void;
  onYes: () => void;
  onNo: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const describe = useErrorText();
  const z21Ip = setup?.bigfredIpv4 ?? setup?.bigfredHost ?? "—";
  const openNetworkLabel = t("drive.wlanmaus.wifiOpenNetwork");
  const passwordDisplay = wifiPasswordDisplay(setup, openNetworkLabel);

  const wifiSteps: NumberedStep[] = Array.from({ length: 11 }, (_, i) => ({
    body: (
      <Trans
        i18nKey={`drive.wlanmaus.wifiSteps.${i + 1}`}
        values={{
          ssid: wifiSsidDisplay(setup),
          password: passwordDisplay,
          z21Ip,
        }}
        components={WLANMAUS_STEP_COMPONENTS}
      />
    ),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("drive.wlanmaus.wifiQuestion")}
      </Typography>
      <Box
        component="img"
        src={DEVICE_OPTIONS.find((o) => o.id === "wlanmaus")?.image}
        alt=""
        sx={{ width: 160, height: 160, objectFit: "contain", mb: 3, display: "block", mx: "auto" }}
      />
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="success"
          onClick={onYes}
          disabled={stationsLoading || stationsError != null}
          sx={{
            minWidth: 120,
            opacity: needsSetup === true ? 0.55 : 1,
            boxShadow: needsSetup === false ? 4 : 1,
          }}
        >
          {stationsLoading ? <CircularProgress size={22} color="inherit" /> : t("drive.wlanmaus.wifiYes")}
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={onNo}
          sx={{
            minWidth: 120,
            opacity: needsSetup === false ? 0.55 : 1,
            boxShadow: needsSetup === true ? 4 : 1,
          }}
        >
          {t("drive.wlanmaus.wifiNo")}
        </Button>
      </Stack>

      {stationsError ? (
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {describe(stationsError)}
          </Alert>
          {onRetryStations ? (
            <Button variant="outlined" onClick={onRetryStations}>
              {t("app.retry")}
            </Button>
          ) : null}
        </Box>
      ) : null}

      {needsSetup === true && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t("drive.wlanmaus.wifiCredentialsTitle")}
          </Typography>
          <WifiCredentials
            setup={setup}
            loading={setupLoading}
            error={setupError}
            onRetry={onRetrySetup}
            ssidLabel={t("drive.wlanmaus.wifiSsid")}
            passwordLabel={t("drive.wlanmaus.wifiPassword")}
            openNetworkLabel={openNetworkLabel}
          />
          {setup ? (
            <>
              <Typography sx={{ mb: 2 }}>
                <strong>{t("drive.wlanmaus.wifiZ21Ip")}:</strong> {z21Ip}
              </Typography>
              <NumberedSteps steps={wifiSteps} />
            </>
          ) : null}
        </Box>
      )}

      <Stack direction="row" justifyContent="space-between">
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        {needsSetup === true && (
          <Button
            variant="contained"
            disabled={setupLoading || !setup || stationsLoading || stationsError != null}
            onClick={onContinue}
          >
            {t("app.next")}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
