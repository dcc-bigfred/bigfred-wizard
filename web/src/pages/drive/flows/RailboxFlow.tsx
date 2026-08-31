import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import WifiJoinStep from "../../../components/drive/WifiJoinStep";
import LocoListStep from "../../../components/drive/steps/LocoListStep";
import PairingStep from "../../../components/drive/steps/PairingStep";
import RailboxAppQrStep from "../../../components/drive/steps/RailboxAppQrStep";
import RailboxConnectStep from "../../../components/drive/steps/RailboxConnectStep";
import RailboxPairingSetupStep from "../../../components/drive/steps/RailboxPairingSetupStep";
import RePairConfirmStep from "../../../components/drive/steps/RePairConfirmStep";
import StationStep from "../../../components/drive/steps/StationStep";
import UserStep from "../../../components/drive/steps/UserStep";
import { api } from "../../../api/client";
import type { User } from "../../../api/types";
import type { DriveFlowProps } from "../flowProps";

export default function RailboxFlow({
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
    stationsLoading,
    stationsError,
    retryStations,
    handsetSetup,
    handsetSetupLoading,
    handsetSetupError,
    retryHandsetSetup,
    setHandsetSetup,
    setHandsetSetupError,
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
    void api.connectDrive(picked.login).catch(() => {
      /* pairing / F2 will surface failures */
    });
    setBusy(false);
    setPhase("railboxAppQr");
  };

  const goToLocoList = async () => {
    if (!user) return;
    const list = await loadVehicles(user);
    if (list) setPhase("railboxLocoList");
  };

  if (phase === "phoneWifi") {
    return (
      <WifiJoinStep
        variant="howto"
        title={t("drive.phone.wifiTitle")}
        setup={handsetSetup}
        setupLoading={handsetSetupLoading}
        setupError={handsetSetupError}
        onRetrySetup={retryHandsetSetup}
        continueLabel={t("drive.phone.wifiDone")}
        onBack={() => {
          setHandsetSetup(null);
          setHandsetSetupError(null);
          onBackToDevices();
        }}
        onContinue={() => setPhase("user")}
      />
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
          setPhase("phoneWifi");
        }}
        backLabel={t("app.back")}
      />
    );
  }

  if (phase === "railboxAppQr") {
    return (
      <RailboxAppQrStep
        onNext={() => setPhase("railboxConnect")}
        onBack={() => {
          setUser(null);
          setPhase("user");
        }}
      />
    );
  }

  if (phase === "railboxConnect") {
    return (
      <RailboxConnectStep
        setup={handsetSetup}
        setupLoading={handsetSetupLoading}
        setupError={handsetSetupError}
        onRetrySetup={retryHandsetSetup}
        onBack={() => setPhase("railboxAppQr")}
        onContinue={() => setPhase("railboxPairingSetup")}
      />
    );
  }

  if (phase === "railboxPairingSetup") {
    return (
      <RailboxPairingSetupStep
        onBack={() => setPhase("railboxConnect")}
        onContinue={() => proceedToPairingIfReady()}
        stationsLoading={stationsLoading}
        stationsError={stationsError}
        onRetryStations={retryStations}
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
        onBack={() => setPhase("railboxPairingSetup")}
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
        onContinue={() => void goToLocoList()}
        onRetry={() => {
          if (user && station) void beginPairing(user, station, device);
        }}
      />
    );
  }

  if (phase === "railboxLocoList") {
    return (
      <LocoListStep
        titleKey="drive.railbox.locoListTitle"
        hintKey="drive.railbox.locoListHint"
        vehicles={vehicles}
        onDone={() => navigate("/")}
      />
    );
  }

  return null;
}
