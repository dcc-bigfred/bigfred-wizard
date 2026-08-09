import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { ChoiceList, ChoiceOption } from "../components/ChoiceList";
import ErrorAlert from "../components/ErrorAlert";
import NumberedSteps, { type NumberedStep } from "../components/NumberedSteps";
import UserPicker from "../components/UserPicker";
import { api, ApiError } from "../api/client";
import type { CommandStation, RemotePairing, User, Vehicle, WizardConfig } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  DEVICE_OPTIONS,
  howToEnterKey,
  isPhoneDevice,
  pairingDigits,
  protocolForDevice,
  WLANMAUS_ASSETS,
  type DriveDevice,
} from "../drive/devices";

type Phase =
  | "device"
  | "phoneQr"
  | "phoneDrive"
  | "user"
  | "station"
  | "rePairConfirm"
  | "pairing"
  | "pickLoco"
  | "howToEnter";

const POLL_MS = 3000;

function supportsProtocol(station: CommandStation, device: DriveDevice): boolean {
  const protocol = protocolForDevice(device);
  return protocol === "z21" ? station.z21ServerEnabled : station.withrottleServerEnabled;
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

  const stepperLabels = useMemo(() => {
    if (!device) {
      return ["device"];
    }
    if (isPhoneDevice(device)) {
      return ["device", "qr", "drive"];
    }
    return ["device", "user", "pairing", "loco", "howto"];
  }, [device]);

  const activeStepIndex = useMemo(() => {
    const map: Record<Phase, string> = {
      device: "device",
      phoneQr: "qr",
      phoneDrive: "drive",
      user: "user",
      station: "pairing",
      rePairConfirm: "pairing",
      pairing: "pairing",
      pickLoco: "loco",
      howToEnter: "howto",
    };
    const key = map[phase];
    const idx = stepperLabels.indexOf(key);
    return idx < 0 ? 0 : idx;
  }, [phase, stepperLabels]);

  const pickDevice = (id: DriveDevice) => {
    setDevice(id);
    setError(null);
    if (isPhoneDevice(id)) {
      setPhase("phoneQr");
    } else {
      setPhase("user");
    }
  };

  useEffect(() => {
    if (!me || !device || isPhoneDevice(device)) {
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

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setBusy(true);
    setError(null);
  };

  // After the participant is chosen, auto-start pairing (one CS) or ask which CS.
  useEffect(() => {
    if (!user || !device || isPhoneDevice(device) || pairing) {
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
    const timer = window.setInterval(() => {
      api
        .remoteStatus(me.layoutId, station.id, user.login)
        .then((status) => {
          if (status.paired) setPaired(true);
        })
        .catch(() => undefined);
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

  const expired = pairing !== null && !paired && pairing.expiresAt < Date.now();

  return (
    <AppShell title={t("drive.heading")} showBack>
      <Stepper activeStep={activeStepIndex} alternativeLabel sx={{ mb: 4 }}>
        {stepperLabels.map((key) => (
          <Step key={key}>
            <StepLabel>{t(`drive.stepper.${key}`)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <ErrorAlert error={error} />

        {phase === "device" && <DevicePicker onPick={pickDevice} />}

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
              <Button variant="outlined" onClick={cancel}>
                {t("app.cancel")}
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
            onContinue={() => void goPickLoco()}
            onRetry={() => {
              if (user && station && device) void beginPairing(user, station, device);
            }}
          />
        )}

        {phase === "pickLoco" && (
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

        {phase === "user" && (
          <Stack direction="row" sx={{ mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate("/")}>
              {t("app.cancel")}
            </Button>
          </Stack>
        )}
      </Paper>
    </AppShell>
  );
}

function DevicePicker({ onPick }: { onPick: (id: DriveDevice) => void }) {
  const { t } = useTranslation();
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
    return [
      {
        body: t("drive.steps.powerOnWlanmaus"),
        imageSrc: WLANMAUS_ASSETS.ok,
        imageAlt: "OK",
      },
      {
        body: t("drive.steps.openAnyLoco"),
        imageSrc: WLANMAUS_ASSETS.selectLoco,
      },
      ...pressSteps,
    ];
  }

  if (device === "longfred" || device === "wifred") {
    return [
      { body: t("drive.steps.powerOnHandset") },
      { body: t("drive.steps.openPairingLoco") },
      ...pressSteps,
    ];
  }

  // railbox / generic withrottle apps
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
