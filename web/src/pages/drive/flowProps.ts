import type { DriveDevice } from "../../drive/devices";
import type { Phase } from "./types";
import type { DriveSession } from "./useDriveSession";

export interface DriveFlowProps {
  device: DriveDevice;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  session: DriveSession;
  onBackToDevices: () => void;
}
