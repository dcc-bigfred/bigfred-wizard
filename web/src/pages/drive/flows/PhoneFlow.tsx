import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../../auth/AuthContext";
import WifiJoinStep from "../../../components/drive/WifiJoinStep";
import PhoneDriveStep from "../../../components/drive/steps/PhoneDriveStep";
import PhoneQrStep from "../../../components/drive/steps/PhoneQrStep";
import type { DriveFlowProps } from "../flowProps";

export default function PhoneFlow({
  device,
  phase,
  setPhase,
  session,
  onBackToDevices,
}: DriveFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useAuth();
  const {
    handsetSetup,
    handsetSetupLoading,
    handsetSetupError,
    retryHandsetSetup,
    setHandsetSetup,
    setHandsetSetupError,
  } = session;

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
        onContinue={() => setPhase("phoneQr")}
      />
    );
  }

  if (phase === "phoneQr") {
    return (
      <PhoneQrStep
        device={device}
        config={config}
        onNext={() => setPhase("phoneDrive")}
        onCancel={() => setPhase("phoneWifi")}
      />
    );
  }

  if (phase === "phoneDrive") {
    return <PhoneDriveStep onDone={() => navigate("/")} onBack={() => setPhase("phoneQr")} />;
  }

  return null;
}
