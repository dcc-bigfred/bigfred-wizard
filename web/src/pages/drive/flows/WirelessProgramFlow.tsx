import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../../../api/client";
import type { CommandStation, User } from "../../../api/types";
import {
  driverCapabilities,
  generateLongfredIdentity,
  wirelessApi,
  type Candidate,
  type HelloResult,
  type JobFrame,
} from "../../../api/wireless";
import { useAuth } from "../../../auth/AuthContext";
import PinDialog from "../../../components/PinDialog";
import RosterPicker, { rosterFromVehicles } from "../../../components/RosterPicker";
import EnterPairingStep from "../../../components/drive/steps/EnterPairingStep";
import ProgrammingProgress from "../../../components/drive/steps/ProgrammingProgress";
import RePairConfirmStep from "../../../components/drive/steps/RePairConfirmStep";
import ScanStep from "../../../components/drive/steps/ScanStep";
import StationStep from "../../../components/drive/steps/StationStep";
import UserStep from "../../../components/drive/steps/UserStep";
import { wirelessDriverId, type LongFredVariantId } from "../../../drive/devices";
import type { DriveFlowProps } from "../flowProps";
import { friendlyWirelessError } from "../helpers";

export default function WirelessProgramFlow({
  device,
  phase,
  setPhase,
  session,
}: DriveFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, config } = useAuth();
  const {
    user,
    setUser,
    busy,
    setBusy,
    setError,
    pinError,
    setPinError,
    stations,
    station,
    setStation,
    stationsError,
    setPairing,
    vehicles,
    confirmReplacePairing,
    declineReplacePairing,
    loadVehicles,
    setExistingClientKey,
  } = session;

  const [pin, setPin] = useState("");
  const [longfredVariant, setLongfredVariant] = useState<LongFredVariantId | null>(null);
  const [wpHello, setWpHello] = useState<HelloResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [jobFrame, setJobFrame] = useState<JobFrame | null>(null);
  const [failDetail, setFailDetail] = useState("");

  const continueWifredAfterPin = useCallback(
    async (picked: User, cs: CommandStation) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      setStation(cs);
      try {
        const status = await api.remoteStatus(me.layoutId, cs.id, picked.login);
        if (status.paired) {
          setExistingClientKey(status.clientKey);
          setPhase("rePairConfirm");
          return;
        }
        setExistingClientKey(undefined);
        setPhase("wpEnterPairing");
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [me, setBusy, setError, setStation, setPhase, setExistingClientKey],
  );

  const maxRosterSlots = useMemo(() => {
    const driver = wirelessDriverId(device);
    if (!driver || !wpHello) {
      return device === "longfred" ? 12 : 4;
    }
    return driverCapabilities(wpHello, driver)?.maxRosterSlots ?? (device === "longfred" ? 12 : 4);
  }, [device, wpHello]);

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setBusy(true);
    setError(null);
    void api.connectDrive(picked.login).catch(() => undefined);
    setBusy(false);
    setPhase("wpPin");
  };

  const submitWifredPin = async (value: string) => {
    if (!me || !user) return;
    setBusy(true);
    setPinError(null);
    setError(null);
    try {
      await api.verifyPin(user.login, value, me.layoutId);
      setPin(value);
      if (stationsError) {
        setError(stationsError);
        return;
      }
      if (stations === null) {
        setError(new ApiError(503, "stations_loading"));
        return;
      }
      if (stations.length === 0) {
        setError(new ApiError(422, "no_programming_station"));
        return;
      }
      if (stations.length === 1 && stations[0]) {
        await continueWifredAfterPin(user, stations[0]);
        return;
      }
      setPhase("station");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === "invalid_credentials")) {
        setPinError(t("drive.program.pinInvalid"));
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const runScan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCandidates(null);
    setCandidate(null);
    try {
      const hello = wpHello ?? (await wirelessApi.hello());
      setWpHello(hello);
      const all = await wirelessApi.scan();
      const driver = wirelessDriverId(device);
      const filtered = driver ? all.filter((c) => c.driver === driver) : all;
      setCandidates(filtered);
    } catch (err) {
      setError(err);
      setCandidates([]);
    } finally {
      setBusy(false);
    }
  }, [device, wpHello, setBusy, setError]);

  useEffect(() => {
    if (phase === "wpScan") {
      void runScan();
    }
  }, [phase, runScan]);

  const startProgramming = async (picked: Candidate | null = candidate) => {
    if (!user || !picked) return;
    if (device !== "longfred" && !vehicles) return;
    if (!config?.wifiSsid) {
      setError(new ApiError(400, "wifi_not_configured", t("drive.program.wifiMissing")));
      return;
    }
    setBusy(true);
    setError(null);
    setJobFrame(null);
    setPhase("wpProgramming");

    let wifredPairingCsId: number | null = null;
    try {
      const roster =
        device === "longfred"
          ? []
          : rosterFromVehicles(vehicles ?? [], rosterIds).map((r) => ({
              address: r.address,
              longAddress: r.longAddress,
              direction: r.direction,
              functions: r.functions,
            }));

      let identity: string;
      if (device === "wifred") {
        if (!me || !station) {
          throw new ApiError(422, "no_programming_station");
        }
        const pending = await api.startPairing(me.layoutId, station.id, "withrottle", user.login, {
          allowAllVehicles: true,
          vehicleIds: [],
        });
        setPairing(pending);
        const code = pending.pairingCode?.replace(/\D/g, "") ?? "";
        if (code.length !== 6) {
          throw new ApiError(500, "pairing_code_missing");
        }
        identity = code;
        wifredPairingCsId = station.id;
      } else {
        identity = generateLongfredIdentity();
      }

      const result = await wirelessApi.program({
        candidate: { driver: picked.driver, key: picked.key },
        identity,
        roster,
        bigfred: device === "longfred" ? { login: user.login, pin } : undefined,
        rosterMode: device === "longfred" ? "auto" : undefined,
      });
      const terminal = await wirelessApi.watchJob(result.jobId, (frame) => {
        setJobFrame(frame);
      });
      if (terminal.state === "done") {
        setPhase("wpDone");
      } else {
        if (wifredPairingCsId != null && me) {
          await api.cancelPairing(me.layoutId, wifredPairingCsId, user.login).catch(() => undefined);
        }
        setFailDetail(terminal.detail ?? friendlyWirelessError(null, t));
        setPhase("wpFailed");
      }
    } catch (err) {
      if (wifredPairingCsId != null && me && user) {
        await api.cancelPairing(me.layoutId, wifredPairingCsId, user.login).catch(() => undefined);
      }
      setFailDetail(friendlyWirelessError(err, t));
      setPhase("wpFailed");
    } finally {
      setBusy(false);
    }
  };

  const loadRosterAndContinue = async (picked: Candidate) => {
    if (!user) return;
    setCandidate(picked);
    if (device === "longfred") {
      await startProgramming(picked);
      return;
    }
    const list = await loadVehicles(user);
    if (list) {
      setRosterIds([]);
      setPhase("wpRoster");
    }
  };

  if (phase === "user") {
    return (
      <UserStep
        selected={user}
        onSelect={onUserPicked}
        busy={busy}
        onBack={() => navigate("/")}
        backLabel={t("app.cancel")}
        title={t("drive.program.whoDrives")}
      />
    );
  }

  if (phase === "wpPin") {
    return (
      <PinDialog
        minLength={4}
        maxLength={6}
        title={
          device === "wifred" ? t("drive.program.pinWifredTitle") : t("drive.program.pinLongfredTitle")
        }
        hint={
          device === "wifred" ? t("drive.program.pinWifredHint") : t("drive.program.pinLongfredHint")
        }
        busy={busy}
        error={device === "wifred" ? pinError : null}
        onSubmit={(value) => {
          if (device === "wifred") {
            void submitWifredPin(value);
          } else {
            setPin(value);
            setPhase("wpEnterPairing");
          }
        }}
      />
    );
  }

  if (phase === "station" && user) {
    return (
      <StationStep
        stations={stations}
        station={station}
        onSelect={setStation}
        busy={busy}
        onBack={() => setPhase("wpPin")}
        onStart={() => {
          if (!station || !user) return;
          void continueWifredAfterPin(user, station);
        }}
      />
    );
  }

  if (phase === "rePairConfirm") {
    return (
      <RePairConfirmStep
        busy={busy}
        onKeep={declineReplacePairing}
        onReplace={() => void confirmReplacePairing()}
      />
    );
  }

  if (phase === "wpEnterPairing") {
    return (
      <EnterPairingStep
        device={device}
        variant={longfredVariant}
        onVariant={setLongfredVariant}
        onContinue={() => setPhase("wpScan")}
        onBack={() => setPhase("wpPin")}
      />
    );
  }

  if (phase === "wpScan") {
    return (
      <ScanStep
        candidates={candidates}
        busy={busy}
        selected={candidate}
        onSelect={(c) => void loadRosterAndContinue(c)}
        onRetry={() => void runScan()}
        onBack={() => setPhase("wpEnterPairing")}
      />
    );
  }

  if (phase === "wpRoster") {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {t("drive.program.rosterTitle")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("drive.program.rosterHint", { max: maxRosterSlots })}
        </Typography>
        {vehicles === null ? (
          <CircularProgress />
        ) : (
          <RosterPicker
            vehicles={vehicles}
            selectedIds={rosterIds}
            maxSlots={maxRosterSlots}
            onChange={setRosterIds}
          />
        )}
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
          <Button variant="outlined" onClick={() => setPhase("wpScan")}>
            {t("app.back")}
          </Button>
          <Button
            variant="contained"
            disabled={rosterIds.length === 0 || busy}
            onClick={() => void startProgramming()}
          >
            {t("drive.program.rosterContinue")}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (phase === "wpProgramming") {
    return <ProgrammingProgress frame={jobFrame} />;
  }

  if (phase === "wpDone") {
    return (
      <Box sx={{ textAlign: "center" }}>
        <Alert severity="success" sx={{ mb: 3, textAlign: "left" }}>
          <Typography variant="h6">{t("drive.program.doneTitle")}</Typography>
          <Typography>{t("drive.program.doneLead")}</Typography>
        </Alert>
        <Button variant="contained" onClick={() => navigate("/")}>
          {t("drive.program.doneHome")}
        </Button>
      </Box>
    );
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
              setPhase("wpScan");
            }}
          >
            {t("drive.program.failedRetry")}
          </Button>
        </Stack>
      </Box>
    );
  }

  return null;
}
