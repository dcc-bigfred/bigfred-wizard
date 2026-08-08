import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import ErrorAlert from "../components/ErrorAlert";
import UserPicker from "../components/UserPicker";
import { api } from "../api/client";
import type { CommandStation, RemotePairing, RemoteProtocol, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";

type Variant = "phone" | "wlanmaus" | "longfred";

interface Props {
  variant: Variant;
  protocol: RemoteProtocol;
}

const POLL_INTERVAL_MS = 3000;

function supportsProtocol(station: CommandStation, protocol: RemoteProtocol): boolean {
  return protocol === "z21" ? station.z21ServerEnabled : station.withrottleServerEnabled;
}

export default function PairHandsetPage({ variant, protocol }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useAuth();

  const [step, setStep] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [stations, setStations] = useState<CommandStation[] | null>(null);
  const [station, setStation] = useState<CommandStation | null>(null);
  const [allVehicles, setAllVehicles] = useState(true);
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!me) {
      return;
    }
    let cancelled = false;
    api
      .commandStations(me.layoutId)
      .then((list) => {
        if (cancelled) {
          return;
        }
        const usable = list.filter((cs) => supportsProtocol(cs, protocol));
        setStations(usable);
        setStation(usable[0] ?? null);
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [me, protocol]);

  const start = useCallback(async () => {
    if (!me || !user || !station) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.startPairing(me.layoutId, station.id, protocol, user.login, {
        allowAllVehicles: allVehicles,
        vehicleIds: [],
      });
      setPairing(res);
      setPaired(false);
      setStep(2);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [me, user, station, protocol, allVehicles]);

  // Poll until the handset shows up, then stop touching the API.
  useEffect(() => {
    if (!pairing || paired || !me || !user || !station) {
      return;
    }
    const timer = window.setInterval(() => {
      api
        .remoteStatus(me.layoutId, station.id, user.login)
        .then((status) => {
          if (status.paired) {
            setPaired(true);
          }
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pairing, paired, me, user, station]);

  const cancel = async () => {
    if (me && station && user && pairing && !paired) {
      await api.cancelPairing(me.layoutId, station.id, user.login).catch(() => undefined);
    }
    navigate("/");
  };

  const expired = pairing !== null && !paired && pairing.expiresAt < Date.now();

  return (
    <AppShell title={t(`pair.heading.${variant}`)} showBack>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {["user", "station", "pairing"].map((key) => (
          <Step key={key}>
            <StepLabel>{t(`pair.steps.${key}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: 4 }}>
        <ErrorAlert error={error} />

        {step === 0 && (
          <UserPicker
            selected={user}
            onSelect={(picked) => {
              setUser(picked);
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
          <Box>
            {stations === null ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : stations.length === 0 ? (
              <Alert severity="warning">{t("errors.no_programming_station")}</Alert>
            ) : (
              <List disablePadding>
                {stations.map((cs) => (
                  <ListItemButton
                    key={cs.id}
                    selected={station?.id === cs.id}
                    onClick={() => setStation(cs)}
                  >
                    <ListItemText primary={cs.name} secondary={cs.kind} />
                  </ListItemButton>
                ))}
              </List>
            )}
            <FormControlLabel
              sx={{ mt: 2 }}
              control={
                <Switch
                  checked={allVehicles}
                  onChange={(e) => setAllVehicles(e.target.checked)}
                />
              }
              label={t("pair.allVehicles")}
            />
          </Box>
        )}

        {step === 2 && pairing && (
          <Box sx={{ textAlign: "center" }}>
            {paired ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                {t("pair.paired")}
              </Alert>
            ) : expired ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {t("pair.expired")}
              </Alert>
            ) : (
              <Stack direction="row" spacing={2} justifyContent="center" sx={{ mb: 2 }}>
                <CircularProgress size={24} />
                <Typography>{t("pair.waiting")}</Typography>
              </Stack>
            )}

            {pairing.pairingCode && (
              <>
                <Typography variant="subtitle1">{t("pair.codeLabel")}</Typography>
                <Typography variant="h2" sx={{ letterSpacing: "0.2em", my: 1 }}>
                  {pairing.pairingCode}
                </Typography>
              </>
            )}
            {pairing.pairingCV3 !== undefined && (
              <>
                <Typography variant="subtitle1">{t("pair.cvLabel")}</Typography>
                <Typography variant="h3" sx={{ my: 1 }}>
                  CV3 = {pairing.pairingCV3} · CV4 = {pairing.pairingCV4}
                </Typography>
              </>
            )}
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              {t(
                variant === "wlanmaus"
                  ? "pair.instructionsWlanmaus"
                  : variant === "longfred"
                    ? "pair.instructionsLongfred"
                    : "pair.instructionsPhone",
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {pairing.displayLabel}
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 4 }} justifyContent="space-between">
          <Button variant="outlined" onClick={step === 0 ? () => navigate("/") : cancel}>
            {t("app.cancel")}
          </Button>
          {step === 1 && (
            <Button variant="contained" disabled={!station || busy} onClick={start}>
              {t("pair.start")}
            </Button>
          )}
          {step === 2 && (
            <Button variant="contained" disabled={!paired && !expired} onClick={() => navigate("/")}>
              {t("app.finish")}
            </Button>
          )}
        </Stack>
      </Paper>
    </AppShell>
  );
}
