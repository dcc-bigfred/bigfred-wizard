import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import LocoListStep from "../../../components/drive/steps/LocoListStep";
import PairingStep from "../../../components/drive/steps/PairingStep";
import RePairConfirmStep from "../../../components/drive/steps/RePairConfirmStep";
import StationStep from "../../../components/drive/steps/StationStep";
import UserStep from "../../../components/drive/steps/UserStep";
import WlanmausDriveModeStep from "../../../components/drive/steps/WlanmausDriveModeStep";
import WlanmausWifiStep from "../../../components/drive/steps/WlanmausWifiStep";
import { api } from "../../../api/client";
import type { User } from "../../../api/types";
import type { DriveFlowProps } from "../flowProps";

export default function WlanmausFlow({
  device,
  phase,
  setPhase,
  session,
}: DriveFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [wifiNeedsSetup, setWifiNeedsSetup] = useState<boolean | null>(null);
  const {
    user,
    setUser,
    busy,
    setBusy,
    setError,
    stations,
    station,
    setStation,
    stationsLoading,
    stationsError,
    retryStations,
    handsetSetup,
    handsetSetupLoading,
    handsetSetupError,
    retryHandsetSetup,
    loadHandsetSetup,
    pairing,
    paired,
    expired,
    vehicles,
    beginPairing,
    confirmReplacePairing,
    declineReplacePairing,
    proceedToPairingIfReady,
    loadVehicles,
    backFromPairing,
  } = session;

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setBusy(true);
    setError(null);
    setWifiNeedsSetup(null);
    void api.connectDrive(picked.login).catch(() => {
      /* pairing / F2 will surface failures */
    });
    setBusy(false);
    setPhase("wlanmausWifi");
  };

  const onWifiNo = () => {
    setWifiNeedsSetup(true);
    if (!handsetSetup && !handsetSetupLoading) {
      void loadHandsetSetup();
    }
  };

  const onWifiYes = () => {
    setWifiNeedsSetup(false);
    proceedToPairingIfReady();
  };

  const goToLocoList = async () => {
    if (!user) return;
    const list = await loadVehicles(user);
    if (list) setPhase("wlanmausLocoList");
  };

  if (phase === "user") {
    return (
      <UserStep
        selected={user}
        onSelect={onUserPicked}
        busy={busy}
        onBack={() => navigate("/")}
        backLabel={t("app.cancel")}
      />
    );
  }

  if (phase === "wlanmausWifi") {
    return (
      <WlanmausWifiStep
        needsSetup={wifiNeedsSetup}
        setup={handsetSetup}
        setupLoading={handsetSetupLoading}
        setupError={handsetSetupError}
        onRetrySetup={retryHandsetSetup}
        stationsLoading={stationsLoading}
        stationsError={stationsError}
        onRetryStations={retryStations}
        onYes={onWifiYes}
        onNo={onWifiNo}
        onContinue={() => proceedToPairingIfReady()}
        onBack={() => {
          setUser(null);
          setWifiNeedsSetup(null);
          setPhase("user");
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
        onBack={() => setPhase("wlanmausWifi")}
        onStart={() => {
          if (!station || !user) return;
          void beginPairing(user, station, device);
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

  if (phase === "pairing" && pairing) {
    return (
      <PairingStep
        device={device}
        pairing={pairing}
        paired={paired}
        expired={expired}
        busy={busy}
        onCancel={() => void backFromPairing()}
        onContinue={() => setPhase("wlanmausDriveMode")}
        onRetry={() => {
          if (user && station) void beginPairing(user, station, device);
        }}
      />
    );
  }

  if (phase === "wlanmausDriveMode") {
    return (
      <WlanmausDriveModeStep
        onBack={() => setPhase("pairing")}
        onContinue={() => void goToLocoList()}
        busy={busy}
      />
    );
  }

  if (phase === "wlanmausLocoList") {
    return (
      <LocoListStep
        titleKey="drive.wlanmaus.locoListTitle"
        hintKey="drive.wlanmaus.locoListHint"
        vehicles={vehicles}
        onDone={() => navigate("/")}
      />
    );
  }

  return null;
}
