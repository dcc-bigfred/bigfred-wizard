import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { ChoiceList, ChoiceOption } from "../components/ChoiceList";
import ErrorAlert from "../components/ErrorAlert";
import FlowStepper from "../components/FlowStepper";
import NumberedSteps, { type NumberedStep } from "../components/NumberedSteps";
import PinDialog from "../components/PinDialog";
import RosterPicker, { rosterFromVehicles } from "../components/RosterPicker";
import UserPicker from "../components/UserPicker";
import { api, ApiError } from "../api/client";
import type { CommandStation, HandsetSetup, RemotePairing, User, Vehicle, WizardConfig } from "../api/types";
import {
  driverCapabilities,
  generateLongfredIdentity,
  wirelessApi,
  type Candidate,
  type HelloResult,
  type JobFrame,
  type JobState,
} from "../api/wireless";
import { useAuth } from "../auth/AuthContext";
import { useHelp } from "../help/HelpContext";
import {
  DEVICE_OPTIONS,
  howToEnterKey,
  isPhoneDevice,
  isWirelessProgramDevice,
  isWlanmausDevice,
  LONGFRED_VARIANTS,
  pairingDigits,
  protocolForDevice,
  WLANMAUS_ASSETS,
  WITHROTTLE_ADVANCED_OPTIONS,
  wirelessDriverId,
  type DriveDevice,
  type LongFredVariantId,
} from "../drive/devices";

type Phase =
  | "device"
  | "advancedDevice"
  | "phoneQr"
  | "phoneDrive"
  | "user"
  | "station"
  | "rePairConfirm"
  | "pairing"
  | "wlanmausWifi"
  | "wlanmausDriveMode"
  | "wlanmausLocoList"
  | "pickLoco"
  | "howToEnter"
  // Wireless-programmer flow (WiFred / LongFred):
  | "wpPin"
  | "wpEnterPairing"
  | "wpScan"
  | "wpRoster"
  | "wpProgramming"
  | "wpDone"
  | "wpFailed";

const POLL_MS = 3000;

function supportsProtocol(station: CommandStation, device: DriveDevice): boolean {
  const protocol = protocolForDevice(device);
  return protocol === "z21" ? station.z21ServerEnabled : station.withrottleServerEnabled;
}

function friendlyWirelessError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const key = `drive.program.errors.${err.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (err.message) return err.message;
  }
  return t("drive.program.errors.generic");
}

export default function DriveFlowPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, config } = useAuth();

  const [phase, setPhase] = useState<Phase>("device");
  const [device, setDevice] = useState<DriveDevice | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [stations, setStations] = useState<CommandStation[] | null>(null);
  const [station, setStation] = useState<CommandStation | null>(null);
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  const [paired, setPaired] = useState(false);
  const [existingClientKey, setExistingClientKey] = useState<string | undefined>();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [pickedLoco, setPickedLoco] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Wireless-programmer state
  const [pin, setPin] = useState("");
  const [longfredVariant, setLongfredVariant] = useState<LongFredVariantId | null>(null);
  const [wpHello, setWpHello] = useState<HelloResult | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [jobFrame, setJobFrame] = useState<JobFrame | null>(null);
  const [failDetail, setFailDetail] = useState<string>("");
  const [wlanmausWifiNeedsSetup, setWlanmausWifiNeedsSetup] = useState<boolean | null>(null);
  const [handsetSetup, setHandsetSetup] = useState<HandsetSetup | null>(null);
  const [handsetSetupLoading, setHandsetSetupLoading] = useState(false);

  const wireless = device != null && isWirelessProgramDevice(device);

  const stepperLabels = useMemo(() => {
    if (!device) {
      return ["device"];
    }
    if (isPhoneDevice(device)) {
      return ["device", "qr", "drive"];
    }
    if (isWirelessProgramDevice(device)) {
      return [
        "device",
        "user",
        "pin",
        "enterPairing",
        "scan",
        "pickRoster",
        "programming",
        "done",
      ];
    }
    if (isWlanmausDevice(device)) {
      return ["device", "user", "wifi", "pairing", "driveMode", "loco"];
    }
    return ["device", "user", "pairing", "loco", "howto"];
  }, [device]);

  const activeStepIndex = useMemo(() => {
    const map: Record<Phase, string> = {
      device: "device",
      advancedDevice: "device",
      phoneQr: "qr",
      phoneDrive: "drive",
      user: "user",
      station: "pairing",
      rePairConfirm: "pairing",
      pairing: "pairing",
      wlanmausWifi: "wifi",
      wlanmausDriveMode: "driveMode",
      wlanmausLocoList: "loco",
      pickLoco: "loco",
      howToEnter: "howto",
      wpPin: "pin",
      wpEnterPairing: "enterPairing",
      wpScan: "scan",
      wpRoster: "pickRoster",
      wpProgramming: "programming",
      wpDone: "done",
      wpFailed: "programming",
    };
    const key = map[phase];
    const idx = stepperLabels.indexOf(key);
    return idx < 0 ? 0 : idx;
  }, [phase, stepperLabels]);

  const stepLabel = (key: string) => {
    const programKey = `drive.program.steps.${key}`;
    const translated = t(programKey);
    if (translated !== programKey) return translated;
    return t(`drive.stepper.${key}`);
  };

  const pickDevice = (id: DriveDevice) => {
    setError(null);
    if (id === "withrottle-advanced") {
      setDevice(null);
      setPhase("advancedDevice");
      return;
    }
    setDevice(id);
    if (isPhoneDevice(id)) {
      setPhase("phoneQr");
    } else {
      setPhase("user");
    }
  };

  useEffect(() => {
    if (!me || !device || isPhoneDevice(device) || isWirelessProgramDevice(device)) {
      return;
    }
    let cancelled = false;
    api
      .commandStations(me.layoutId)
      .then((list) => {
        if (cancelled) return;
        const usable = list.filter((cs) => supportsProtocol(cs, device));
        setStations(usable);
        setStation(usable[0] ?? null);
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [me, device]);

  const startPairing = useCallback(
    async (picked: User, cs: CommandStation, d: DriveDevice) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.startPairing(
          me.layoutId,
          cs.id,
          protocolForDevice(d),
          picked.login,
          { allowAllVehicles: true, vehicleIds: [] },
        );
        setPairing(res);
        setPaired(false);
        setPhase("pairing");
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [me],
  );

  /** Check for an existing session; ask before replacing it. */
  const beginPairing = useCallback(
    async (picked: User, cs: CommandStation, d: DriveDevice) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      setStation(cs);
      try {
        const status = await api.remoteStatus(me.layoutId, cs.id, picked.login);
        if (status.paired) {
          setExistingClientKey(status.clientKey);
          setPhase("rePairConfirm");
          setBusy(false);
          return;
        }
        setExistingClientKey(undefined);
        await startPairing(picked, cs, d);
      } catch (err) {
        setError(err);
        setBusy(false);
      }
    },
    [me, startPairing],
  );

  const confirmReplacePairing = async () => {
    if (!me || !user || !station || !device) return;
    setBusy(true);
    setError(null);
    try {
      await api.unpairSession(me.layoutId, station.id, user.login, existingClientKey);
      setExistingClientKey(undefined);
      await startPairing(user, station, device);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const declineReplacePairing = () => {
    setExistingClientKey(undefined);
    setPhase("user");
    setUser(null);
    setBusy(false);
    setError(null);
  };

  const proceedToWlanmausPairing = useCallback(() => {
    if (!user || !device || !isWlanmausDevice(device)) {
      return;
    }
    setError(null);
    if (stations === null) {
      return;
    }
    if (stations.length === 0) {
      setError(new ApiError(422, "no_programming_station"));
      return;
    }
    if (stations.length === 1 && stations[0]) {
      setStation(stations[0]);
      void beginPairing(user, stations[0], device);
      return;
    }
    setPhase("station");
  }, [user, device, stations, beginPairing]);

  const loadHandsetSetup = useCallback(async () => {
    setHandsetSetupLoading(true);
    setError(null);
    try {
      const setup = await api.handsetSetup();
      setHandsetSetup(setup);
    } catch (err) {
      setError(err);
    } finally {
      setHandsetSetupLoading(false);
    }
  }, []);

  const onWlanmausWifiNo = () => {
    setWlanmausWifiNeedsSetup(true);
    if (!handsetSetup && !handsetSetupLoading) {
      void loadHandsetSetup();
    }
  };

  const onWlanmausWifiYes = () => {
    setWlanmausWifiNeedsSetup(false);
    proceedToWlanmausPairing();
  };

  const goToWlanmausLocoList = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.vehicles(user.login);
      setVehicles(
        list.filter(
          (v) =>
            (v.ownerLogin != null && v.ownerLogin === user.login) ||
            (v.ownerId != null && v.ownerId === user.id),
        ),
      );
      setPhase("wlanmausLocoList");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setBusy(true);
    setError(null);
    setWlanmausWifiNeedsSetup(null);
    setHandsetSetup(null);
    void api.connectDrive(picked.login).catch(() => {
      /* pairing / F2 will surface failures */
    });
    if (device && isWirelessProgramDevice(device)) {
      setBusy(false);
      setPhase("wpPin");
      return;
    }
    if (device && isWlanmausDevice(device)) {
      setBusy(false);
      setPhase("wlanmausWifi");
      return;
    }
  };

  // After the participant is chosen, auto-start pairing (one CS) or ask which CS.
  useEffect(() => {
    if (!user || !device || isPhoneDevice(device) || isWirelessProgramDevice(device) || isWlanmausDevice(device) || pairing) {
      return;
    }
    if (stations === null) {
      return;
    }
    if (phase !== "user") {
      return;
    }
    if (stations.length === 0) {
      setError(new ApiError(422, "no_programming_station"));
      setBusy(false);
      return;
    }
    if (stations.length === 1 && stations[0]) {
      setStation(stations[0]);
      void beginPairing(user, stations[0], device);
      return;
    }
    setBusy(false);
    setPhase("station");
  }, [user, device, stations, pairing, phase, beginPairing]);

  useEffect(() => {
    if (!pairing || paired || !me || !user || !station) {
      return;
    }
    const expiredNow = pairing.expiresAt < Date.now();
    if (expiredNow) {
      return;
    }
    let consecutiveFailures = 0;
    const timer = window.setInterval(() => {
      api
        .remoteStatus(me.layoutId, station.id, user.login)
        .then((status) => {
          consecutiveFailures = 0;
          if (status.paired) setPaired(true);
        })
        .catch((err) => {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            setError(err);
          }
        });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pairing, paired, me, user, station]);

  const goPickLoco = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.vehicles(user.login);
      setVehicles(
        list.filter(
          (v) =>
            (v.ownerLogin != null && v.ownerLogin === user.login) ||
            (v.ownerId != null && v.ownerId === user.id),
        ),
      );
      setPhase("pickLoco");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (me && station && user && pairing && !paired) {
      await api.cancelPairing(me.layoutId, station.id, user.login).catch(() => undefined);
    }
    navigate("/");
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
      const driver = device ? wirelessDriverId(device) : null;
      const filtered = driver ? all.filter((c) => c.driver === driver) : all;
      setCandidates(filtered);
    } catch (err) {
      setError(err);
      setCandidates([]);
    } finally {
      setBusy(false);
    }
  }, [device, wpHello]);

  useEffect(() => {
    if (phase === "wpScan") {
      void runScan();
    }
  }, [phase, runScan]);

  const loadRosterAndContinue = async (picked: Candidate) => {
    if (!user) return;
    setCandidate(picked);
    setBusy(true);
    setError(null);
    try {
      const list = await api.vehicles(user.login);
      setVehicles(
        list.filter(
          (v) =>
            (v.ownerLogin != null && v.ownerLogin === user.login) ||
            (v.ownerId != null && v.ownerId === user.id),
        ),
      );
      setRosterIds([]);
      setPhase("wpRoster");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const startProgramming = async () => {
    if (!device || !user || !candidate || !vehicles) return;
    if (!config?.wifiSsid) {
      setError(new ApiError(400, "wifi_not_configured", t("drive.program.wifiMissing")));
      return;
    }
    setBusy(true);
    setError(null);
    setJobFrame(null);
    setPhase("wpProgramming");
    try {
      const identity =
        device === "wifred" ? pin : generateLongfredIdentity();
      const roster = rosterFromVehicles(vehicles, rosterIds).map((r) => ({
        address: r.address,
        longAddress: r.longAddress,
        direction: r.direction,
        functions: r.functions,
      }));
      const result = await wirelessApi.program({
        candidate: { driver: candidate.driver, key: candidate.key },
        identity,
        roster,
        bigfred:
          device === "longfred"
            ? { login: user.login, pin }
            : undefined,
        rosterMode: device === "longfred" ? "static" : undefined,
      });
      const terminal = await wirelessApi.watchJob(result.jobId, (frame) => {
        setJobFrame(frame);
      });
      if (terminal.state === "done") {
        setPhase("wpDone");
      } else {
        setFailDetail(terminal.detail ?? friendlyWirelessError(null, t));
        setPhase("wpFailed");
      }
    } catch (err) {
      setFailDetail(friendlyWirelessError(err, t));
      setPhase("wpFailed");
    } finally {
      setBusy(false);
    }
  };

  const expired = pairing !== null && !paired && pairing.expiresAt < Date.now();

  const maxRosterSlots = useMemo(() => {
    const driver = device ? wirelessDriverId(device) : null;
    if (!driver || !wpHello) {
      return device === "longfred" ? 12 : 4;
    }
    return driverCapabilities(wpHello, driver)?.maxRosterSlots ?? (device === "longfred" ? 12 : 4);
  }, [device, wpHello]);

  return (
    <AppShell title={t("drive.heading")} showBack>
      <FlowStepper
        activeStep={activeStepIndex}
        labels={stepperLabels.map((key) => stepLabel(key))}
      />

      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <ErrorAlert error={error} />

        {phase === "device" && <DevicePicker onPick={pickDevice} />}

        {phase === "advancedDevice" && (
          <AdvancedDevicePicker
            onPick={(id) => {
              setDevice(id);
              setPhase("user");
            }}
            onBack={() => setPhase("device")}
          />
        )}

        {phase === "phoneQr" && device && (
          <PhoneQrStep
            device={device}
            config={config}
            onNext={() => setPhase("phoneDrive")}
            onCancel={() => navigate("/")}
          />
        )}

        {phase === "phoneDrive" && (
          <PhoneDriveStep onDone={() => navigate("/")} onBack={() => setPhase("phoneQr")} />
        )}

        {phase === "user" && (
          <Box>
            {wireless ? (
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t("drive.program.whoDrives")}
              </Typography>
            ) : null}
            <UserPicker
              selected={user}
              onSelect={(picked) => {
                onUserPicked(picked);
              }}
            />
            {busy && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress />
              </Box>
            )}
            <Stack direction="row" sx={{ mt: 3 }}>
              <Button variant="outlined" onClick={() => navigate("/")}>
                {t("app.cancel")}
              </Button>
            </Stack>
          </Box>
        )}

        {phase === "wlanmausWifi" && (
          <WlanmausWifiStep
            needsSetup={wlanmausWifiNeedsSetup}
            setup={handsetSetup}
            setupLoading={handsetSetupLoading}
            stationsLoading={stations === null}
            onYes={onWlanmausWifiYes}
            onNo={onWlanmausWifiNo}
            onContinue={() => proceedToWlanmausPairing()}
            onBack={() => {
              setUser(null);
              setWlanmausWifiNeedsSetup(null);
              setHandsetSetup(null);
              setPhase("user");
            }}
          />
        )}

        {phase === "wlanmausDriveMode" && (
          <WlanmausDriveModeStep
            onBack={() => setPhase("pairing")}
            onContinue={() => void goToWlanmausLocoList()}
            busy={busy}
          />
        )}

        {phase === "wlanmausLocoList" && (
          <WlanmausLocoListStep
            vehicles={vehicles}
            onDone={() => navigate("/")}
          />
        )}

        {phase === "wpPin" && device && (
          <PinDialog
            exact={device === "wifred" ? 6 : undefined}
            minLength={4}
            maxLength={6}
            title={
              device === "wifred"
                ? t("drive.program.pinWifredTitle")
                : t("drive.program.pinLongfredTitle")
            }
            hint={
              device === "wifred"
                ? t("drive.program.pinWifredHint")
                : t("drive.program.pinLongfredHint")
            }
            onSubmit={(value) => {
              setPin(value);
              setPhase("wpEnterPairing");
            }}
          />
        )}

        {phase === "wpEnterPairing" && device && (
          <EnterPairingStep
            device={device}
            variant={longfredVariant}
            onVariant={setLongfredVariant}
            onContinue={() => setPhase("wpScan")}
            onBack={() => setPhase("wpPin")}
          />
        )}

        {phase === "wpScan" && (
          <ScanStep
            candidates={candidates}
            busy={busy}
            selected={candidate}
            onSelect={(c) => void loadRosterAndContinue(c)}
            onRetry={() => void runScan()}
            onBack={() => setPhase("wpEnterPairing")}
          />
        )}

        {phase === "wpRoster" && (
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
        )}

        {phase === "wpProgramming" && (
          <ProgrammingProgress frame={jobFrame} />
        )}

        {phase === "wpDone" && (
          <Box sx={{ textAlign: "center" }}>
            <Alert severity="success" sx={{ mb: 3, textAlign: "left" }}>
              <Typography variant="h6">{t("drive.program.doneTitle")}</Typography>
              <Typography>{t("drive.program.doneLead")}</Typography>
            </Alert>
            <Button variant="contained" onClick={() => navigate("/")}>
              {t("drive.program.doneHome")}
            </Button>
          </Box>
        )}

        {phase === "wpFailed" && (
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
        )}

        {phase === "station" && device && user && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t("drive.pickStation")}
            </Typography>
            {stations === null ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <ChoiceList>
                {stations.map((cs) => (
                  <ChoiceOption
                    key={cs.id}
                    selected={station?.id === cs.id}
                    onClick={() => setStation(cs)}
                    primary={cs.name}
                  />
                ))}
              </ChoiceList>
            )}
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
              <Button
                variant="outlined"
                onClick={() => (device === "wlanmaus" ? setPhase("wlanmausWifi") : cancel())}
              >
                {t("app.back")}
              </Button>
              <Button
                variant="contained"
                disabled={!station || busy}
                onClick={() => station && void beginPairing(user, station, device)}
              >
                {t("drive.startPairing")}
              </Button>
            </Stack>
          </Box>
        )}

        {phase === "rePairConfirm" && (
          <Box>
            <Typography variant="h5" sx={{ mb: 2 }}>
              {t("drive.alreadyPairedTitle")}
            </Typography>
            <Typography sx={{ mb: 3, fontSize: "1.15rem" }}>
              {t("drive.alreadyPairedAsk")}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="space-between">
              <Button variant="outlined" disabled={busy} onClick={declineReplacePairing}>
                {t("drive.keepExisting")}
              </Button>
              <Button variant="contained" disabled={busy} onClick={() => void confirmReplacePairing()}>
                {busy ? <CircularProgress size={22} color="inherit" /> : t("drive.replacePairing")}
              </Button>
            </Stack>
          </Box>
        )}

        {phase === "pairing" && pairing && device && (
          <PairingStep
            device={device}
            pairing={pairing}
            paired={paired}
            expired={expired}
            busy={busy}
            onCancel={cancel}
            onContinue={() =>
              isWlanmausDevice(device) ? setPhase("wlanmausDriveMode") : void goPickLoco()
            }
            onRetry={() => {
              if (user && station && device) void beginPairing(user, station, device);
            }}
          />
        )}

        {phase === "pickLoco" && device && !isWlanmausDevice(device) && (
          <PickLocoStep
            vehicles={vehicles}
            selected={pickedLoco}
            onSelect={setPickedLoco}
            onBack={() => setPhase("pairing")}
            onNext={() => setPhase("howToEnter")}
          />
        )}

        {phase === "howToEnter" && device && pickedLoco && (
          <HowToEnterStep
            device={device}
            loco={pickedLoco}
            onDone={() => navigate("/")}
          />
        )}
      </Paper>
    </AppShell>
  );
}

function DevicePicker({ onPick }: { onPick: (id: DriveDevice) => void }) {
  const { t } = useTranslation();
  const { showHelp } = useHelp();

  const openWhatToChoose = () => {
    const paragraphs = t("drive.whatToChooseBody", { returnObjects: true });
    const items = Array.isArray(paragraphs) ? (paragraphs as string[]) : [];
    showHelp(
      <>
        {items.map((paragraph) => (
          <Typography key={paragraph} component="p" sx={{ m: 0, "&:not(:last-child)": { mb: 2 } }}>
            {paragraph}
          </Typography>
        ))}
      </>,
    );
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.pickDevice")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("drive.pickDeviceHint")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        <Card variant="outlined" sx={{ borderLeft: "10px solid #ca8a04" }}>
          <CardActionArea onClick={openWhatToChoose} sx={{ p: 2.5, minHeight: 140 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <HelpOutlineIcon sx={{ fontSize: 48, color: "#ca8a04" }} />
              </Box>
              <Box>
                <Typography variant="h6">{t("drive.whatToChoose")}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t("drive.whatToChooseHint")}
                </Typography>
              </Box>
            </Stack>
          </CardActionArea>
        </Card>
        {DEVICE_OPTIONS.map((opt) => (
          <Card key={opt.id} variant="outlined">
            <CardActionArea onClick={() => onPick(opt.id)} sx={{ p: 2.5, minHeight: 140 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  component="img"
                  src={opt.image}
                  alt=""
                  sx={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0 }}
                />
                <Box>
                  <Typography variant="h6">{t(`drive.devices.${opt.id}.title`)}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {opt.badge && (
                      <Box
                        component="img"
                        src={opt.badge}
                        alt=""
                        sx={{
                          width: 18,
                          height: 18,
                          verticalAlign: "middle",
                          mr: 0.5,
                          display: "inline-block",
                        }}
                      />
                    )}
                    {t(`drive.devices.${opt.id}.hint`)}
                  </Typography>
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

function AdvancedDevicePicker({
  onPick,
  onBack,
}: {
  onPick: (id: DriveDevice) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.devices.withrottle-advanced.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("drive.devices.withrottle-advanced.hint")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        {WITHROTTLE_ADVANCED_OPTIONS.map((opt) => (
          <Card key={opt.id} variant="outlined">
            <CardActionArea onClick={() => onPick(opt.id)} sx={{ p: 2.5, minHeight: 140 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  component="img"
                  src={opt.image}
                  alt=""
                  sx={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0 }}
                />
                <Box>
                  <Typography variant="h6">{t(`drive.devices.${opt.id}.title`)}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t(`drive.devices.${opt.id}.hint`)}
                  </Typography>
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      <Stack direction="row" sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
      </Stack>
    </Box>
  );
}
function EnterPairingStep({
  device,
  variant,
  onVariant,
  onContinue,
  onBack,
}: {
  device: DriveDevice;
  variant: LongFredVariantId | null;
  onVariant: (id: LongFredVariantId) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  if (device === "wifred") {
    const steps: NumberedStep[] = [1, 2].map((n) => ({
      body: t(`drive.program.wifredEnter.${n}`),
    }));
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {t("drive.program.enterPairingTitle")}
        </Typography>
        <Box
          component="img"
          src={DEVICE_OPTIONS.find((o) => o.id === "wifred")?.image}
          alt=""
          sx={{ width: 160, height: 160, objectFit: "contain", mb: 2, display: "block", mx: "auto" }}
        />
        <NumberedSteps steps={steps} />
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
          <Button variant="outlined" onClick={onBack}>
            {t("app.back")}
          </Button>
          <Button variant="contained" onClick={onContinue}>
            {t("drive.program.enterPairingContinue")}
          </Button>
        </Stack>
      </Box>
    );
  }

  const selected = LONGFRED_VARIANTS.find((v) => v.id === variant) ?? null;
  const canContinue = selected != null;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("drive.program.pickVariantTitle")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          mb: 3,
        }}
      >
        {LONGFRED_VARIANTS.map((v) => (
          <Card
            key={v.id}
            variant="outlined"
            sx={{
              borderColor: variant === v.id ? "primary.main" : undefined,
              borderWidth: variant === v.id ? 2 : 1,
            }}
          >
            <CardActionArea onClick={() => onVariant(v.id)} sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  component="img"
                  src={v.image}
                  alt=""
                  sx={{ width: 72, height: 72, objectFit: "contain" }}
                />
                <Typography variant="h6">
                  {t(`drive.program.longfredVariants.${v.id}.title`)}
                </Typography>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      {selected && (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t("drive.program.enterPairingTitle")}
          </Typography>
          <NumberedSteps
            steps={Array.from({ length: selected.stepCount }, (_, i) => ({
              body: t(`drive.program.longfredVariants.${selected.id}.steps.${i + 1}`),
            }))}
          />
        </>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={!canContinue} onClick={onContinue}>
          {t("drive.program.enterPairingContinue")}
        </Button>
      </Stack>
    </Box>
  );
}

const WLANMAUS_STEP_COMPONENTS = {
  strong: <strong />,
  menu: <strong />,
  ok: <strong />,
};

function WlanmausWifiStep({
  needsSetup,
  setup,
  setupLoading,
  stationsLoading,
  onYes,
  onNo,
  onContinue,
  onBack,
}: {
  needsSetup: boolean | null;
  setup: HandsetSetup | null;
  setupLoading: boolean;
  stationsLoading: boolean;
  onYes: () => void;
  onNo: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const z21Ip = setup?.bigfredIpv4 ?? setup?.bigfredHost ?? "—";
  const passwordDisplay =
    setup?.wifiPsk?.trim() ? setup.wifiPsk : t("drive.wlanmaus.wifiOpenNetwork");

  const wifiSteps: NumberedStep[] = Array.from({ length: 11 }, (_, i) => ({
    body: (
      <Trans
        i18nKey={`drive.wlanmaus.wifiSteps.${i + 1}`}
        values={{
          ssid: setup?.wifiSsid ?? "—",
          password: passwordDisplay,
          z21Ip,
        }}
        components={WLANMAUS_STEP_COMPONENTS}
      />
    ),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.wlanmaus.wifiQuestion")}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant={needsSetup === false ? "contained" : "outlined"}
          onClick={onYes}
          disabled={stationsLoading}
        >
          {stationsLoading ? <CircularProgress size={22} color="inherit" /> : t("drive.wlanmaus.wifiYes")}
        </Button>
        <Button
          variant={needsSetup === true ? "contained" : "outlined"}
          onClick={onNo}
        >
          {t("drive.wlanmaus.wifiNo")}
        </Button>
      </Stack>

      {needsSetup === true && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t("drive.wlanmaus.wifiCredentialsTitle")}
          </Typography>
          {setupLoading || !setup ? (
            <CircularProgress />
          ) : (
            <>
              <Typography sx={{ mb: 0.5 }}>
                <strong>{t("drive.wlanmaus.wifiSsid")}:</strong> {setup.wifiSsid}
              </Typography>
              <Typography sx={{ mb: 0.5 }}>
                <strong>{t("drive.wlanmaus.wifiPassword")}:</strong> {passwordDisplay}
              </Typography>
              <Typography sx={{ mb: 2 }}>
                <strong>{t("drive.wlanmaus.wifiZ21Ip")}:</strong> {z21Ip}
              </Typography>
              <NumberedSteps steps={wifiSteps} />
            </>
          )}
        </Box>
      )}

      <Stack direction="row" justifyContent="space-between">
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        {needsSetup === true && (
          <Button
            variant="contained"
            disabled={setupLoading || !setup || stationsLoading}
            onClick={onContinue}
          >
            {t("app.next")}
          </Button>
        )}
      </Stack>
    </Box>
  );
}

function WlanmausDriveModeStep({
  onBack,
  onContinue,
  busy,
}: {
  onBack: () => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const steps: NumberedStep[] = Array.from({ length: 5 }, (_, i) => ({
    body: (
      <Trans
        i18nKey={`drive.wlanmaus.driveModeSteps.${i + 1}`}
        components={WLANMAUS_STEP_COMPONENTS}
      />
    ),
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.wlanmaus.driveModeTitle")}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={busy} onClick={onContinue}>
          {busy ? <CircularProgress size={22} color="inherit" /> : t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}

function WlanmausLocoListStep({
  vehicles,
  onDone,
}: {
  vehicles: Vehicle[] | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.wlanmaus.locoListTitle")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t("drive.wlanmaus.locoListHint")}
      </Typography>
      {vehicles === null ? (
        <CircularProgress />
      ) : vehicles.length === 0 ? (
        <Alert severity="info">{t("drive.noLocos")}</Alert>
      ) : (
        <ChoiceList maxHeight={420}>
          {vehicles.map((v) => (
            <ChoiceOption
              key={v.id}
              selected={false}
              onClick={() => {}}
              primary={v.name}
              secondary={
                v.dccAddress != null
                  ? t("drive.locoAddress", { address: v.dccAddress })
                  : t("drive.locoNoAddress")
              }
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}

function ScanStep({
  candidates,
  busy,
  selected,
  onSelect,
  onRetry,
  onBack,
}: {
  candidates: Candidate[] | null;
  busy: boolean;
  selected: Candidate | null;
  onSelect: (c: Candidate) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("drive.program.scanTitle")}
      </Typography>
      {busy || candidates === null ? (
        <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
          <CircularProgress />
          <Typography color="text.secondary">{t("drive.program.scanBusy")}</Typography>
        </Stack>
      ) : candidates.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("drive.program.scanEmpty")}
        </Alert>
      ) : (
        <ChoiceList>
          {candidates.map((c) => (
            <ChoiceOption
              key={`${c.driver}:${c.key}`}
              selected={selected?.key === c.key && selected.driver === c.driver}
              onClick={() => onSelect(c)}
              primary={c.label}
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack} disabled={busy}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onRetry} disabled={busy}>
          {t("drive.program.scanRetry")}
        </Button>
      </Stack>
    </Box>
  );
}
function ProgrammingProgress({ frame }: { frame: JobFrame | null }) {
  const { t } = useTranslation();
  const state: JobState = frame?.state ?? "queued";
  const progress = frame?.progress ?? (state === "done" ? 100 : undefined);
  return (
    <Box sx={{ textAlign: "center", py: 2 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.program.programmingTitle")}
      </Typography>
      <CircularProgress sx={{ mb: 3 }} />
      <Typography variant="h6" sx={{ mb: 2 }}>
        {t(`drive.program.programmingStates.${state}`)}
      </Typography>
      {progress != null ? (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 10, borderRadius: 1, mb: 1 }}
        />
      ) : (
        <LinearProgress sx={{ height: 10, borderRadius: 1, mb: 1 }} />
      )}
    </Box>
  );
}

function PhoneQrStep({
  device,
  config,
  onNext,
  onCancel,
}: {
  device: DriveDevice;
  config: WizardConfig | null;
  onNext: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const target = device === "android" ? "android" : "bigfred";
  const urlMissing =
    device === "android" && (!config?.androidAppUrl || config.androidAppUrl.trim() === "");

  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t(device === "android" ? "drive.phone.scanPlayTitle" : "drive.phone.scanWebTitle")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t(device === "android" ? "drive.phone.scanPlayLead" : "drive.phone.scanWebLead")}
      </Typography>
      {urlMissing ? (
        <Alert severity="warning" sx={{ textAlign: "left", mb: 3 }}>
          {t("drive.phone.androidUrlMissing")}
        </Alert>
      ) : (
        <Box
          component="img"
          src={`/api/v1/wizard/qr.svg?target=${target}`}
          alt={t("drive.phone.qrAlt")}
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
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {device === "android"
          ? config?.androidAppUrl
          : config?.bigfredPublicUrl ?? "http://bigfred.local:8080"}
      </Typography>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onCancel}>
          {t("app.cancel")}
        </Button>
        <Button variant="contained" onClick={onNext} disabled={urlMissing}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}


function PhoneDriveStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const steps: NumberedStep[] = [1, 2, 3, 4].map((n) => ({
    body: t(`drive.phone.driveSteps.${n}`),
  }));
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.phone.driveTitle")}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}
function PairingStep({
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
        <Typography sx={{ mb: 2, fontSize: "1.1rem" }}>
          {t("drive.wlanmaus.pairingLead")}
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
          {t("app.cancel")}
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


function buildPairingSteps(
  device: DriveDevice,
  digits: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): NumberedStep[] {
  const pressSteps: NumberedStep[] = [...digits].map((d) => ({
    body: (
      <Trans
        i18nKey={
          device === "wlanmaus" ? "drive.steps.pressWlanmausKey" : "drive.steps.pressF"
        }
        values={{ key: d, f: `F${d}` }}
        components={{ strong: <strong /> }}
      />
    ),
    imageSrc: device === "wlanmaus" ? WLANMAUS_ASSETS.functionKeys : undefined,
  }));

  if (device === "wlanmaus") {
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
    { body: t("drive.steps.openApp", { app: t(`drive.devices.${device}.title`) }) },
    { body: t("drive.steps.connectBigFred") },
    {
      body: (
        <Trans
          i18nKey="drive.steps.typeDeviceName"
          values={{ code: digits }}
          components={{ strong: <strong /> }}
        />
      ),
    },
    { body: t("drive.steps.orPairingLoco") },
    ...pressSteps,
  ];
}

function PickLocoStep({
  vehicles,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  vehicles: Vehicle[] | null;
  selected: Vehicle | null;
  onSelect: (v: Vehicle) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.pickLoco")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t("drive.pickLocoHint")}
      </Typography>
      {vehicles === null ? (
        <CircularProgress />
      ) : vehicles.length === 0 ? (
        <Alert severity="info">{t("drive.noLocos")}</Alert>
      ) : (
        <ChoiceList maxHeight={380}>
          {vehicles.map((v) => (
            <ChoiceOption
              key={v.id}
              selected={selected?.id === v.id}
              onClick={() => onSelect(v)}
              primary={v.name}
              secondary={
                v.dccAddress != null
                  ? t("drive.locoAddress", { address: v.dccAddress })
                  : t("drive.locoNoAddress")
              }
            />
          ))}
        </ChoiceList>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={!selected} onClick={onNext}>
          {t("app.next")}
        </Button>
      </Stack>
    </Box>
  );
}
function HowToEnterStep({
  device,
  loco,
  onDone,
}: {
  device: DriveDevice;
  loco: Vehicle;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const key = howToEnterKey(device);
  const address = loco.dccAddress ?? "—";
  const steps: NumberedStep[] = [1, 2, 3].map((n) => ({
    body: t(`drive.howToEnter.${key}.${n}`, {
      name: loco.name,
      address: String(address),
    }),
    imageSrc: key === "wlanmaus" && n === 1 ? WLANMAUS_ASSETS.selectLoco : undefined,
  }));

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {t("drive.howToEnterTitle", { name: loco.name })}
      </Typography>
      <NumberedSteps steps={steps} />
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 4 }}>
        <Button variant="contained" onClick={onDone}>
          {t("app.finish")}
        </Button>
      </Stack>
    </Box>
  );
}
