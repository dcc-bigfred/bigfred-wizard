import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import ErrorAlert from "../components/ErrorAlert";
import NumericKeypad from "../components/NumericKeypad";
import UserPicker from "../components/UserPicker";
import { api } from "../api/client";
import type { ProgrammingStatus, User } from "../api/types";

const KINDS = ["loco", "emu", "driving_wagon", "trolley", "wagon"] as const;
const PROG_MODE = "prog";

function formatPool(user: User): string {
  return user.dccPool
    .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`))
    .join(", ");
}

function inPool(user: User, address: number): boolean {
  return user.dccPool.some((r) => address >= r.from && address <= r.to);
}

export default function ConfigureLocoPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<ProgrammingStatus | null>(null);
  const [currentAddress, setCurrentAddress] = useState<number | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [written, setWritten] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("loco");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .programmingStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  const address = Number(newAddress);
  const addressValid = address >= 1 && address <= 10239;

  const readAddress = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.getAddress(undefined, PROG_MODE);
      setCurrentAddress(res.locoAddress ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const writeAddress = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setAddress(address, PROG_MODE, true);
      setWritten(true);
      setName((prev) => prev || `#${address}`);
      setStep(3);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const createVehicle = async () => {
    if (!user) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const vehicle = await api.createVehicle(
        { name: name.trim(), kind, dccAddress: address },
        user.login,
      );
      setCreatedName(vehicle.name);
      setStep(4);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title={t("loco.heading")} showBack>
      <Stepper activeStep={Math.min(step, 3)} sx={{ mb: 4 }}>
        {["user", "read", "address", "vehicle"].map((key) => (
          <Step key={key}>
            <StepLabel>{t(`loco.steps.${key}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: 4 }}>
        <ErrorAlert error={error} />
        {status && !status.connected && status.commandStationId === undefined && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t("loco.programmingOffline")}
          </Alert>
        )}

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
            <Alert severity="info" sx={{ mb: 2 }}>
              {t("loco.putOnTrack")}
            </Alert>
            {currentAddress !== null && (
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t("loco.currentAddress", { address: currentAddress })}
              </Typography>
            )}
            <Stack direction="row" spacing={2}>
              <Button variant="contained" disabled={busy} onClick={readAddress}>
                {t("loco.readCurrent")}
              </Button>
              <Button variant="outlined" onClick={() => setStep(2)}>
                {t("loco.skipRead")}
              </Button>
            </Stack>
          </Box>
        )}

        {step === 2 && user && (
          <Box>
            <NumericKeypad
              label={t("loco.newAddress")}
              value={newAddress}
              onChange={setNewAddress}
              maxLength={5}
              helperText={t("loco.poolHint", { ranges: formatPool(user) || "—" })}
            />
            {addressValid && !inPool(user, address) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {t("loco.outsidePool")}
              </Alert>
            )}
          </Box>
        )}

        {step === 3 && user && (
          <Box>
            {written && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {t("loco.written", { address })}
              </Alert>
            )}
            <Stack spacing={3}>
              <TextField
                label={t("loco.vehicleName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                select
                label={t("loco.vehicleKind")}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {t(`loco.kinds.${value}`)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Box>
        )}

        {step === 4 && user && createdName && (
          <Alert severity="success">
            {t("loco.created", { name: createdName, login: user.login })}
          </Alert>
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 4 }} justifyContent="space-between">
          <Button
            variant="outlined"
            onClick={() => (step === 0 ? navigate("/") : setStep(Math.max(0, step - 1)))}
          >
            {step === 0 ? t("app.cancel") : t("app.back")}
          </Button>
          {step === 2 && (
            <Button variant="contained" disabled={!addressValid || busy} onClick={writeAddress}>
              {t("loco.writeAddress")}
            </Button>
          )}
          {step === 3 && (
            <Button
              variant="contained"
              disabled={busy || name.trim().length === 0}
              onClick={createVehicle}
            >
              {t("loco.createVehicle")}
            </Button>
          )}
          {step === 4 && (
            <Button variant="contained" onClick={() => navigate("/")}>
              {t("app.finish")}
            </Button>
          )}
        </Stack>
      </Paper>
    </AppShell>
  );
}
