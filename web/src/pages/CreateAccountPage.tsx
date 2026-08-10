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
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";
import { useAuth } from "../auth/AuthContext";

const PIN_MIN = 4;
const PIN_MAX = 6;

/** login → pin → pinRepeat → summary → done */
const FLOW_STEPS = ["login", "pin", "pinRepeat", "summary"] as const;

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
  const normalizedLogin = login.trim().toLowerCase();
  const loginValid = normalizedLogin.length >= 3;
  const pinValid = pin.length >= PIN_MIN && pin.length <= PIN_MAX;
  const pinRepeatValid = pinRepeat.length >= PIN_MIN && pinRepeat.length <= PIN_MAX;
  const pinsMatch = pin === pinRepeat;

  const canGoNext =
    step === 0 ? loginValid : step === 1 ? pinValid : step === 2 ? pinRepeatValid && pinsMatch : false;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await api.createUser({
        login: normalizedLogin,
        pin,
        autoAllocateDccCount: dccPerUser,
      });
      setCreated(user);
      setStep(4);
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

  const goBack = () => {
    setError(null);
    if (step === 0) {
      navigate("/");
      return;
    }
    if (step === 2) {
      setPinRepeat("");
    }
    setStep(step - 1);
  };

  const checkLoginAvailable = async (candidate: string): Promise<boolean> => {
    const users = await api.users();
    return !users.some((u) => u.login.toLowerCase() === candidate);
  };

  const goNext = async () => {
    setError(null);
    if (step === 0) {
      if (!loginValid) return;
      setBusy(true);
      try {
        const available = await checkLoginAvailable(normalizedLogin);
        if (!available) {
          setError(new ApiError(409, "login_taken"));
          return;
        }
        setStep(1);
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 1) {
      setPinRepeat("");
    }
    setStep(step + 1);
  };

  return (
    <AppShell title={t("account.heading")} showBack>
      <Stepper activeStep={Math.min(step, FLOW_STEPS.length - 1)} sx={{ mb: 4 }}>
        {FLOW_STEPS.map((key) => (
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
              onChange={(e) => {
                setLogin(e.target.value.replace(/\s+/g, ""));
                setError(null);
              }}
            />
            {!loginValid && login.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {t("account.loginTooShort")}
              </Alert>
            )}
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              {t("account.rememberCredentials")}
            </Alert>
            <NumericKeypad
              label={t("account.pinLabel")}
              value={pin}
              onChange={setPin}
              maxLength={PIN_MAX}
              mask
              allowReveal
              error={pin.length > 0 && !pinValid}
              helperText={pin.length > 0 && !pinValid ? t("account.pinTooShort") : undefined}
            />
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              {t("account.rememberCredentials")}
            </Alert>
            <NumericKeypad
              label={t("account.pinRepeat")}
              value={pinRepeat}
              onChange={setPinRepeat}
              maxLength={PIN_MAX}
              mask
              allowReveal
              error={pinRepeat.length > 0 && (!pinsMatch || !pinRepeatValid)}
              helperText={
                pinRepeat.length > 0 && !pinRepeatValid
                  ? t("account.pinTooShort")
                  : pinRepeat.length > 0 && !pinsMatch
                    ? t("account.pinMismatch")
                    : undefined
              }
            />
          </Box>
        )}

        {step === 3 && (
          <Box>
            <Typography variant="h6">{login}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {t("account.summaryLead", { count: dccPerUser })}
            </Typography>
          </Box>
        )}

        {step === 4 && created && (
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
          {step < 4 ? (
            <>
              <Button variant="outlined" onClick={goBack} disabled={busy}>
                {step === 0 ? t("app.cancel") : t("app.back")}
              </Button>
              {step < 3 ? (
                <Button
                  variant="contained"
                  disabled={!canGoNext || busy}
                  onClick={() => void goNext()}
                >
                  {t("app.next")}
                </Button>
              ) : (
                <Button variant="contained" disabled={busy} onClick={() => void submit()}>
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
