import { useMemo, useState } from "react";
import Paper from "@mui/material/Paper";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import AppShell from "../components/AppShell";
import ErrorAlert from "../components/ErrorAlert";
import FlowStepper from "../components/FlowStepper";
import DevicePicker from "../components/drive/steps/DevicePicker";
import { useAuth } from "../auth/AuthContext";
import {
  isFredProgramDevice,
  isPhoneDevice,
  isRailboxDevice,
  isWirelessProgramDevice,
  isWlanmausDevice,
  isWithrottleAdvancedDevice,
  type DriveDevice,
} from "../drive/devices";
import FredFlow from "./drive/flows/FredFlow";
import GenericPairingFlow from "./drive/flows/GenericPairingFlow";
import PhoneFlow from "./drive/flows/PhoneFlow";
import RailboxFlow from "./drive/flows/RailboxFlow";
import WirelessProgramFlow from "./drive/flows/WirelessProgramFlow";
import WlanmausFlow from "./drive/flows/WlanmausFlow";
import WithrottleAdvancedFlow from "./drive/flows/WithrottleAdvancedFlow";
import { fixedZ21Candidate } from "./drive/helpers";
import { activeStepIndexFor, stepperLabelsFor, stepLabelFor } from "./drive/stepper";
import type { Phase } from "./drive/types";
import { useDriveSession } from "./drive/useDriveSession";

export default function DriveFlowPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { config } = useAuth();
  const fredSkipDevice = searchParams.get("device") === "fred";

  const [phase, setPhase] = useState<Phase>(fredSkipDevice ? "fredAccountAsk" : "device");
  const [device, setDevice] = useState<DriveDevice | null>(fredSkipDevice ? "fred" : null);
  const [fredGuest, setFredGuest] = useState(false);

  const session = useDriveSession({ device, phase, setPhase });
  const skipZ21 = fixedZ21Candidate(config) != null;

  const stepperLabels = useMemo(
    () => stepperLabelsFor(device, fredGuest, skipZ21),
    [device, fredGuest, skipZ21],
  );
  const activeStepIndex = useMemo(
    () => activeStepIndexFor(phase, stepperLabels, device),
    [phase, stepperLabels, device],
  );

  const onBackToDevices = () => {
    setDevice(null);
    setPhase("device");
    session.setError(null);
    session.setHandsetSetup(null);
    session.setHandsetSetupError(null);
    session.setUser(null);
    session.setStation(null);
    session.setPairing(null);
  };

  const pickDevice = (id: DriveDevice) => {
    session.setError(null);
    session.setHandsetSetup(null);
    session.setHandsetSetupError(null);
    const androidUrlMissing = config != null && config.androidAppUrl.trim() === "";
    if (id === "android" && androidUrlMissing) {
      setDevice("otherPhone");
      setPhase("phoneWifi");
      return;
    }
    setDevice(id);
    if (isPhoneDevice(id) || isRailboxDevice(id)) {
      setPhase("phoneWifi");
    } else if (isFredProgramDevice(id)) {
      setFredGuest(false);
      setPhase("fredAccountAsk");
    } else {
      setPhase("user");
    }
  };

  const flowProps = {
    device: device as DriveDevice,
    phase,
    setPhase,
    session,
    onBackToDevices,
  };

  let body = null;
  if (!device || phase === "device") {
    body = <DevicePicker onPick={pickDevice} />;
  } else if (isPhoneDevice(device)) {
    body = <PhoneFlow {...flowProps} />;
  } else if (isFredProgramDevice(device)) {
    body = (
      <FredFlow
        {...flowProps}
        fredGuest={fredGuest}
        setFredGuest={setFredGuest}
        fredSkipDevice={fredSkipDevice}
      />
    );
  } else if (isWirelessProgramDevice(device)) {
    body = <WirelessProgramFlow {...flowProps} />;
  } else if (isWlanmausDevice(device)) {
    body = <WlanmausFlow {...flowProps} />;
  } else if (isRailboxDevice(device)) {
    body = <RailboxFlow {...flowProps} />;
  } else if (isWithrottleAdvancedDevice(device)) {
    body = <WithrottleAdvancedFlow {...flowProps} />;
  } else {
    body = <GenericPairingFlow {...flowProps} />;
  }

  return (
    <AppShell title={t("drive.heading")} showBack>
      <FlowStepper activeStep={activeStepIndex} labels={stepperLabels.map((key) => stepLabelFor(t, key))} />
      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <ErrorAlert error={session.error} />
        {body}
      </Paper>
    </AppShell>
  );
}
