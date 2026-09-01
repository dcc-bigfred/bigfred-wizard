import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import WifiJoinStep from "../../../components/drive/WifiJoinStep";
import HowToEnterStep from "../../../components/drive/steps/HowToEnterStep";
import PairingStep from "../../../components/drive/steps/PairingStep";
import PickLocoStep from "../../../components/drive/steps/PickLocoStep";
import RePairConfirmStep from "../../../components/drive/steps/RePairConfirmStep";
import StationStep from "../../../components/drive/steps/StationStep";
import UserStep from "../../../components/drive/steps/UserStep";
import { api } from "../../../api/client";
import type { User } from "../../../api/types";
import type { DriveFlowProps } from "../flowProps";

export default function WithrottleAdvancedFlow({
  device,
  phase,
  setPhase,
  session,
  onBackToDevices,
}: DriveFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    setUser,
    busy,
    setBusy,
    setError,
    stations,
    station,
    setStation,
    stationsError,
    retryStations,
    handsetSetup,
    handsetSetupLoading,
    handsetSetupError,
    retryHandsetSetup,
    pairing,
    paired,
    expired,
    vehicles,
    pickedLoco,
    setPickedLoco,
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
    void api.connectDrive(picked.login).catch(() => {
      /* pairing / F2 will surface failures */
    });
    setBusy(false);
    setPhase("wtWifi");
  };

  const goPickLoco = async () => {
    if (!user) return;
    const list = await loadVehicles(user);
    if (list) setPhase("pickLoco");
  };

  if (phase === "user") {
    return (
      <UserStep
        selected={user}
        onSelect={onUserPicked}
        busy={busy}
        onBack={() => {
          setUser(null);
          onBackToDevices();
        }}
        backLabel={t("app.back")}
      />
    );
  }

  if (phase === "wtWifi") {
    return (
      <WifiJoinStep
        variant="credentials"
        title={t("drive.withrottleAdvanced.wifiTitle")}
        hint={t("drive.withrottleAdvanced.wifiHint")}
        setup={handsetSetup}
        setupLoading={handsetSetupLoading}
        setupError={handsetSetupError}
        onRetrySetup={retryHandsetSetup}
        continueLabel={t("drive.phone.wifiDone")}
        continueDisabled={stations === null}
        stationsError={stationsError}
        onRetryStations={retryStations}
        onBack={() => setPhase("user")}
        onContinue={() => proceedToPairingIfReady()}
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
        onBack={() => setPhase("wtWifi")}
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
        onContinue={() => void goPickLoco()}
        onRetry={() => {
          if (user && station) void beginPairing(user, station, device);
        }}
      />
    );
  }

  if (phase === "pickLoco") {
    return (
      <PickLocoStep
        vehicles={vehicles}
        selected={pickedLoco}
        onSelect={setPickedLoco}
        onBack={() => setPhase("pairing")}
        onNext={() => setPhase("howToEnter")}
      />
    );
  }

  if (phase === "howToEnter" && pickedLoco) {
    return <HowToEnterStep device={device} loco={pickedLoco} onDone={() => navigate("/")} />;
  }

  return null;
}
