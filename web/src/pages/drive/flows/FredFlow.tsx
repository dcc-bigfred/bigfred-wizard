import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../../api/client";
import type { User } from "../../../api/types";
import { wirelessApi, type Candidate, type JobFrame } from "../../../api/wireless";
import { useAuth } from "../../../auth/AuthContext";
import RosterPicker from "../../../components/RosterPicker";
import { FRED_KEY_COMPONENTS } from "../../../components/drive/i18nComponents";
import ProgrammingProgress from "../../../components/drive/steps/ProgrammingProgress";
import ScanStep from "../../../components/drive/steps/ScanStep";
import UserStep from "../../../components/drive/steps/UserStep";
import NumberedSteps from "../../../components/NumberedSteps";
import fredLogo from "../../../logos/fred.png";
import type { DriveFlowProps } from "../flowProps";
import { fixedZ21Candidate, friendlyWirelessError } from "../helpers";

export default function FredFlow({
  phase,
  setPhase,
  session,
  onBackToDevices,
  fredGuest,
  setFredGuest,
  fredSkipDevice,
}: DriveFlowProps & {
  fredGuest: boolean;
  setFredGuest: (v: boolean) => void;
  fredSkipDevice: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useAuth();
  const {
    user,
    setUser,
    busy,
    setBusy,
    setError,
    vehicles,
    setVehicles,
    loadVehicles,
  } = session;

  const skipZ21 = fixedZ21Candidate(config) != null;
  const [fredAddressText, setFredAddressText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [jobFrame, setJobFrame] = useState<JobFrame | null>(null);
  const [failDetail, setFailDetail] = useState("");

  const goAfterFredAddress = useCallback(
    (nextCandidate?: Candidate | null) => {
      const fixed = nextCandidate ?? fixedZ21Candidate(config);
      if (fixed) {
        setCandidate(fixed);
        setPhase("fredPlug");
        return;
      }
      setPhase("fredZ21");
    },
    [config, setPhase],
  );

  const loadFredRoster = async (picked: User) => {
    const list = await loadVehicles(picked);
    if (list) {
      setRosterIds([]);
      setPhase("fredRoster");
    }
  };

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setBusy(true);
    setError(null);
    void loadFredRoster(picked);
  };

  const runZ21Scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCandidates(null);
    setCandidate(null);
    try {
      const all = await wirelessApi.scan("z21");
      setCandidates(all.filter((c) => c.driver === "fred"));
    } catch (err) {
      setError(err);
      setCandidates([]);
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError]);

  useEffect(() => {
    if (phase === "fredZ21") {
      void runZ21Scan();
    }
  }, [phase, runZ21Scan]);

  const startFredProgramming = async () => {
    const addr = fredGuest
      ? Number(fredAddressText)
      : (vehicles?.find((v) => v.id === rosterIds[0])?.dccAddress ?? NaN);
    if (!Number.isInteger(addr) || addr < 1 || addr > 10239) {
      setError(new ApiError(400, "invalid_address", t("drive.program.errors.invalid_address")));
      return;
    }
    const target = candidate ?? fixedZ21Candidate(config);
    if (!target) {
      setError(new ApiError(400, "noCandidates", t("drive.program.errors.noCandidates")));
      return;
    }
    setCandidate(target);
    setBusy(true);
    setError(null);
    setJobFrame(null);
    setPhase("wpProgramming");
    try {
      const result = await wirelessApi.program({
        candidate: { driver: "fred", key: target.key },
        identity: "",
        roster: [{ address: addr }],
      });
      const terminal = await wirelessApi.watchJob(result.jobId, (frame) => {
        setJobFrame(frame);
      });
      if (terminal.state === "done") {
        setPhase("fredAskLoco");
      } else {
        const detail = terminal.detail ?? "";
        const mapped = t(`drive.program.errors.${detail}`);
        setFailDetail(
          mapped !== `drive.program.errors.${detail}` ? mapped : detail || friendlyWirelessError(null, t),
        );
        setPhase("wpFailed");
      }
    } catch (err) {
      setFailDetail(friendlyWirelessError(err, t));
      setPhase("wpFailed");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "fredAccountAsk") {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 3 }}>
          {t("drive.fred.accountAskTitle")}
        </Typography>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          }}
        >
          <Card variant="outlined">
            <CardActionArea
              onClick={() => {
                setFredGuest(false);
                setPhase("user");
              }}
              sx={{ p: 2.5, minHeight: 140 }}
            >
              <Typography variant="h6">{t("drive.fred.accountYes")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("drive.fred.accountYesHint")}
              </Typography>
            </CardActionArea>
          </Card>
          <Card variant="outlined">
            <CardActionArea
              onClick={() => {
                setFredGuest(true);
                setUser(null);
                setVehicles(null);
                setRosterIds([]);
                setPhase("fredGuestAddress");
              }}
              sx={{ p: 2.5, minHeight: 140 }}
            >
              <Typography variant="h6">{t("drive.fred.accountNo")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("drive.fred.accountNoHint")}
              </Typography>
            </CardActionArea>
          </Card>
        </Box>
        <Stack direction="row" sx={{ mt: 4 }}>
          <Button
            variant="outlined"
            onClick={() => {
              if (fredSkipDevice) {
                navigate("/");
                return;
              }
              onBackToDevices();
            }}
          >
            {t("app.back")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "fredGuestAddress") {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {t("drive.fred.dccTitle")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("drive.fred.dccHint")}
        </Typography>
        <TextField
          label={t("drive.fred.dccLabel")}
          value={fredAddressText}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 5);
            const n = Number(raw);
            setFredAddressText(n > 10239 ? "10239" : raw);
          }}
          inputMode="numeric"
          fullWidth
          autoFocus
          sx={{ maxWidth: 280, mb: 3 }}
        />
        <Stack direction="row" justifyContent="space-between">
          <Button
            variant="outlined"
            onClick={() => {
              setFredGuest(false);
              setPhase("fredAccountAsk");
            }}
          >
            {t("app.back")}
          </Button>
          <Button
            variant="contained"
            disabled={(() => {
              const n = Number(fredAddressText);
              return !Number.isInteger(n) || n < 1 || n > 10239;
            })()}
            onClick={() => goAfterFredAddress()}
          >
            {t("app.next")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "user") {
    return (
      <UserStep
        selected={user}
        onSelect={onUserPicked}
        busy={busy}
        onBack={() => {
          setUser(null);
          setPhase("fredAccountAsk");
        }}
        backLabel={t("app.back")}
        title={t("drive.program.whoDrives")}
      />
    );
  }

  if (phase === "fredRoster") {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {t("drive.fred.rosterTitle")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("drive.program.rosterHint", { max: 1 })}
        </Typography>
        {vehicles === null ? (
          <CircularProgress />
        ) : (
          <RosterPicker
            vehicles={vehicles}
            selectedIds={rosterIds}
            maxSlots={1}
            onChange={setRosterIds}
          />
        )}
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setUser(null);
              setPhase("user");
            }}
          >
            {t("app.back")}
          </Button>
          <Button
            variant="contained"
            disabled={
              rosterIds.length !== 1 || vehicles?.find((v) => v.id === rosterIds[0])?.dccAddress == null
            }
            onClick={() => goAfterFredAddress()}
          >
            {t("app.next")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "fredZ21") {
    return (
      <ScanStep
        candidates={candidates}
        busy={busy}
        selected={candidate}
        title={t("drive.fred.z21Title")}
        empty={t("drive.fred.z21Empty")}
        busyText={t("drive.fred.z21Busy")}
        onSelect={(c) => {
          setCandidate(c);
          setPhase("fredPlug");
        }}
        onRetry={() => void runZ21Scan()}
        onBack={() => {
          if (fredGuest) setPhase("fredGuestAddress");
          else setPhase("fredRoster");
        }}
      />
    );
  }

  if (phase === "fredPlug") {
    return (
      <Box>
        <NumberedSteps
          steps={[1, 2, 3].map((n) => ({
            body: <Trans i18nKey={`drive.fred.plugSteps.${n}`} components={FRED_KEY_COMPONENTS} />,
          }))}
        />
        <Box
          component="img"
          src={fredLogo}
          alt=""
          sx={{
            display: "block",
            width: "100%",
            maxWidth: 520,
            height: "auto",
            borderRadius: 2,
            mx: "auto",
            my: 3,
          }}
        />
        <Stack direction="row" justifyContent="space-between">
          <Button
            variant="outlined"
            onClick={() => {
              if (skipZ21) {
                setPhase(fredGuest ? "fredGuestAddress" : "fredRoster");
              } else {
                setPhase("fredZ21");
              }
            }}
          >
            {t("app.back")}
          </Button>
          <Button variant="contained" disabled={busy} onClick={() => void startFredProgramming()}>
            {busy ? <CircularProgress size={22} color="inherit" /> : t("loco.program")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "wpProgramming") {
    return <ProgrammingProgress frame={jobFrame} />;
  }

  if (phase === "wpFailed") {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6">{t("drive.program.failedTitle")}</Typography>
          {failDetail ? <Typography sx={{ mt: 1 }}>{failDetail}</Typography> : null}
        </Alert>
        <Stack direction="row" justifyContent="space-between">
          <Button variant="outlined" onClick={() => navigate("/")}>
            {t("app.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setFailDetail("");
              setPhase(skipZ21 ? "fredPlug" : "fredZ21");
            }}
          >
            {t("drive.program.failedRetry")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "fredAskLoco") {
    return (
      <Box>
        <Alert severity="success" sx={{ mb: 2, textAlign: "left" }}>
          <Typography sx={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.45 }}>
            {t("drive.fred.askLocoDone")}
          </Typography>
        </Alert>
        <Alert severity="warning" sx={{ mb: 2, textAlign: "left" }}>
          <Typography sx={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.45 }}>
            <Trans i18nKey="drive.fred.askLocoUnplug" components={FRED_KEY_COMPONENTS} />
          </Typography>
        </Alert>
        <Alert severity="info" sx={{ mb: 3, textAlign: "left" }}>
          <Typography sx={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.45 }}>
            {t("drive.fred.askLocoTitle")}
          </Typography>
        </Alert>
        <Stack spacing={2} alignItems="center">
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
            <Button
              variant="contained"
              onClick={() => {
                const addr = fredGuest
                  ? Number(fredAddressText)
                  : (vehicles?.find((v) => v.id === rosterIds[0])?.dccAddress ?? NaN);
                navigate("/flow/loco", {
                  state: {
                    fromFred: true,
                    address: addr,
                    userLogin: user?.login,
                    vehicleId: fredGuest ? undefined : rosterIds[0],
                  },
                });
              }}
            >
              {t("drive.fred.askLocoYes")}
            </Button>
            <Button variant="outlined" onClick={() => navigate("/")}>
              {t("drive.fred.askLocoNo")}
            </Button>
          </Stack>
          <Button
            variant="text"
            onClick={() => {
              setFailDetail("");
              setJobFrame(null);
              setPhase("fredPlug");
            }}
          >
            {t("drive.fred.askLocoRetry")}
          </Button>
        </Stack>
      </Box>
    );
  }

  return null;
}
