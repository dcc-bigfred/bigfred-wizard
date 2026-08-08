import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { api } from "../api/client";
import type { User } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const PIN_MIN = 4;
const PIN_MAX = 6;

export default function CreateAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useAuth();

  const [step, setStep] = useState(0);
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const [pinRepeat, setPinRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<User | null>(null);

  const dccPerUser = config?.dccPerUser ?? 0;
  const loginValid = login.trim().length >= 3;
  const pinValid = pin.length >= PIN_MIN && pin.length <= PIN_MAX;
  const pinsMatch = pin === pinRepeat;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await api.createUser({
        login: login.trim().toLowerCase(),
        pin,
        autoAllocateDccCount: dccPerUser,
      });
      setCreated(user);
      setStep(3);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setLogin("");
    setPin("");
    setPinRepeat("");
    setCreated(null);
    setError(null);
    setStep(0);
  };

  return (
    <AppShell title={t("account.heading")} showBack>
      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {["login", "pin", "summary"].map((key) => (
          <Step key={key}>
            <StepLabel>{t(`account.steps.${key}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: 4 }}>
        <ErrorAlert error={error} />

        {step === 0 && (
          <Box>
            <TextField
              label={t("account.loginLabel")}
              helperText={t("account.loginHint")}
              value={login}
              autoFocus
              onChange={(e) => setLogin(e.target.value.replace(/\s+/g, ""))}
            />
            {!loginValid && login.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {t("account.loginTooShort")}
              </Alert>
            )}
          </Box>
        )}

        {step === 1 && (
          <Stack spacing={3}>
            <NumericKeypad
              label={t("account.pinLabel")}
              value={pin}
              onChange={setPin}
              maxLength={PIN_MAX}
              mask
              error={pin.length > 0 && !pinValid}
              helperText={pin.length > 0 && !pinValid ? t("account.pinTooShort") : undefined}
            />
            <NumericKeypad
              label={t("account.pinRepeat")}
              value={pinRepeat}
              onChange={setPinRepeat}
              maxLength={PIN_MAX}
              mask
              error={pinRepeat.length > 0 && !pinsMatch}
              helperText={
                pinRepeat.length > 0 && !pinsMatch ? t("account.pinMismatch") : undefined
              }
            />
          </Stack>
        )}

        {step === 2 && (
          <Box>
            <Typography variant="h6">{login}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {t("account.summaryLead", { count: dccPerUser })}
            </Typography>
          </Box>
        )}

        {step === 3 && created && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              {t("account.created", { login: created.login })}
            </Alert>
            <Typography variant="subtitle1" gutterBottom>
              {t("account.pool")}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {created.dccPool.map((range) => (
                <Chip
                  key={`${range.from}-${range.to}`}
                  label={range.from === range.to ? range.from : `${range.from}–${range.to}`}
                  sx={{ fontSize: "1.1rem", py: 2.5 }}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 4 }} justifyContent="space-between">
          {step < 3 ? (
            <>
              <Button
                variant="outlined"
                onClick={() => (step === 0 ? navigate("/") : setStep(step - 1))}
              >
                {step === 0 ? t("app.cancel") : t("app.back")}
              </Button>
              {step < 2 ? (
                <Button
                  variant="contained"
                  disabled={step === 0 ? !loginValid : !pinValid || !pinsMatch}
                  onClick={() => setStep(step + 1)}
                >
                  {t("app.next")}
                </Button>
              ) : (
                <Button variant="contained" disabled={busy} onClick={submit}>
                  {t("account.create")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outlined" onClick={reset}>
                {t("account.another")}
              </Button>
              <Button variant="contained" onClick={() => navigate("/")}>
                {t("app.finish")}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </AppShell>
  );
}
