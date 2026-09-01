import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../../api/client";
import type { CommandStation, HandsetSetup, RemotePairing, User, Vehicle } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import {
  isFredProgramDevice,
  isPhoneDevice,
  isWirelessProgramDevice,
  protocolForDevice,
  type DriveDevice,
} from "../../drive/devices";
import { ownedVehicles, supportsProtocol } from "./helpers";
import type { Phase } from "./types";

const POLL_MS = 3000;

export interface DriveSession {
  user: User | null;
  setUser: (user: User | null) => void;
  stations: CommandStation[] | null;
  station: CommandStation | null;
  setStation: (cs: CommandStation | null) => void;
  pairing: RemotePairing | null;
  setPairing: (p: RemotePairing | null) => void;
  paired: boolean;
  setPaired: (v: boolean) => void;
  existingClientKey: string | undefined;
  setExistingClientKey: (key: string | undefined) => void;
  vehicles: Vehicle[] | null;
  setVehicles: (v: Vehicle[] | null) => void;
  pickedLoco: Vehicle | null;
  setPickedLoco: (v: Vehicle | null) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  error: unknown;
  setError: (err: unknown) => void;
  pinError: string | null;
  setPinError: (v: string | null) => void;
  stationsError: unknown;
  stationsLoading: boolean;
  retryStations: () => void;
  handsetSetup: HandsetSetup | null;
  setHandsetSetup: (v: HandsetSetup | null) => void;
  handsetSetupLoading: boolean;
  handsetSetupError: unknown;
  setHandsetSetupError: (err: unknown) => void;
  loadHandsetSetup: () => Promise<void>;
  retryHandsetSetup: () => void;
  startPairing: (picked: User, cs: CommandStation, d: DriveDevice) => Promise<void>;
  beginPairing: (picked: User, cs: CommandStation, d: DriveDevice) => Promise<void>;
  confirmReplacePairing: () => Promise<void>;
  declineReplacePairing: () => void;
  proceedToPairingIfReady: () => void;
  loadVehicles: (picked: User) => Promise<Vehicle[] | null>;
  cancel: () => Promise<void>;
  backFromPairing: () => Promise<void>;
  expired: boolean;
}

export function useDriveSession({
  device,
  phase,
  setPhase,
}: {
  device: DriveDevice | null;
  phase: Phase;
  setPhase: (phase: Phase) => void;
}): DriveSession {
  const navigate = useNavigate();
  const { me } = useAuth();

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
  const [pinError, setPinError] = useState<string | null>(null);
  const [handsetSetup, setHandsetSetup] = useState<HandsetSetup | null>(null);
  const [handsetSetupLoading, setHandsetSetupLoading] = useState(false);
  const [handsetSetupError, setHandsetSetupError] = useState<unknown>(null);
  const [stationsError, setStationsError] = useState<unknown>(null);
  const [stationsReload, setStationsReload] = useState(0);

  const stationsLoading = stations === null && stationsError == null;

  const retryStations = () => {
    setStationsError(null);
    setStationsReload((n) => n + 1);
  };

  useEffect(() => {
    if (!me || !device || isPhoneDevice(device) || device === "longfred" || isFredProgramDevice(device)) {
      return;
    }
    let cancelled = false;
    setStationsError(null);
    setStations(null);
    setStation(null);
    api
      .commandStations(me.layoutId)
      .then((list) => {
        if (cancelled) return;
        const usable = list.filter((cs) => supportsProtocol(cs, device));
        setStations(usable);
        setStation(usable[0] ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setStationsError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [me, device, stationsReload]);

  const startPairing = useCallback(
    async (picked: User, cs: CommandStation, d: DriveDevice) => {
      if (!me) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.startPairing(me.layoutId, cs.id, protocolForDevice(d), picked.login, {
          allowAllVehicles: true,
          vehicleIds: [],
        });
        setPairing(res);
        setPaired(false);
        setPhase("pairing");
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [me, setPhase],
  );

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
    [me, startPairing, setPhase],
  );

  const confirmReplacePairing = async () => {
    if (!me || !user || !station || !device) return;
    setBusy(true);
    setError(null);
    try {
      await api.unpairSession(me.layoutId, station.id, user.login, existingClientKey);
      setExistingClientKey(undefined);
      if (device === "wifred") {
        setPhase("wpEnterPairing");
        setBusy(false);
        return;
      }
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
    setPinError(null);
  };

  const proceedToPairingIfReady = useCallback(() => {
    if (!user || !device) {
      setError(new ApiError(400, "generic"));
      return;
    }
    setError(null);
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
      setStation(stations[0]);
      void beginPairing(user, stations[0], device);
      return;
    }
    setPhase("station");
  }, [user, device, stations, stationsError, beginPairing, setPhase]);

  const loadHandsetSetup = useCallback(async () => {
    setHandsetSetupLoading(true);
    setHandsetSetupError(null);
    try {
      const setup = await api.handsetSetup();
      setHandsetSetup(setup);
    } catch (err) {
      setHandsetSetup(null);
      setHandsetSetupError(err);
    } finally {
      setHandsetSetupLoading(false);
    }
  }, []);

  const retryHandsetSetup = () => {
    void loadHandsetSetup();
  };

  const loadVehicles = useCallback(async (picked: User): Promise<Vehicle[] | null> => {
    setBusy(true);
    setError(null);
    try {
      const list = await api.vehicles(picked.login);
      const filtered = ownedVehicles(list, picked);
      setVehicles(filtered);
      return filtered;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (
      (phase === "phoneWifi" || phase === "wtWifi" || phase === "railboxConnect") &&
      !handsetSetup &&
      !handsetSetupLoading &&
      !handsetSetupError
    ) {
      void loadHandsetSetup();
    }
  }, [phase, handsetSetup, handsetSetupLoading, handsetSetupError, loadHandsetSetup]);

  useEffect(() => {
    if (
      !user ||
      !device ||
      isPhoneDevice(device) ||
      isWirelessProgramDevice(device) ||
      isFredProgramDevice(device) ||
      device === "wlanmaus" ||
      device === "railbox" ||
      device === "withrottle-advanced" ||
      pairing
    ) {
      return;
    }
    if (stationsError) {
      setError(stationsError);
      setBusy(false);
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
  }, [user, device, stations, stationsError, pairing, phase, beginPairing, setPhase]);

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

  const cancel = async () => {
    if (me && station && user && pairing && !paired) {
      await api.cancelPairing(me.layoutId, station.id, user.login).catch(() => undefined);
    }
    navigate("/");
  };

  const backFromPairing = async () => {
    if (me && station && user && pairing && !paired) {
      await api.cancelPairing(me.layoutId, station.id, user.login).catch(() => undefined);
    }
    setPairing(null);
    setPaired(false);
    if (device === "withrottle-advanced") {
      setPhase("wtWifi");
      return;
    }
    navigate("/");
  };

  const expired = pairing !== null && !paired && pairing.expiresAt < Date.now();

  return {
    user,
    setUser,
    stations,
    station,
    setStation,
    pairing,
    setPairing,
    paired,
    setPaired,
    existingClientKey,
    setExistingClientKey,
    vehicles,
    setVehicles,
    pickedLoco,
    setPickedLoco,
    busy,
    setBusy,
    error,
    setError,
    pinError,
    setPinError,
    stationsError,
    stationsLoading,
    retryStations,
    handsetSetup,
    setHandsetSetup,
    handsetSetupLoading,
    handsetSetupError,
    setHandsetSetupError,
    loadHandsetSetup,
    retryHandsetSetup,
    startPairing,
    beginPairing,
    confirmReplacePairing,
    declineReplacePairing,
    proceedToPairingIfReady,
    loadVehicles,
    cancel,
    backFromPairing,
    expired,
  };
}
