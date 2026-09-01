import type { DriveDevice } from "../../drive/devices";
import {
  isFredProgramDevice,
  isPhoneDevice,
  isRailboxDevice,
  isWirelessProgramDevice,
  isWlanmausDevice,
  isWithrottleAdvancedDevice,
} from "../../drive/devices";
import type { Phase } from "./types";

export function stepperLabelsFor(
  device: DriveDevice | null,
  fredGuest: boolean,
  skipZ21: boolean,
): string[] {
  if (!device) {
    return ["device"];
  }
  if (isPhoneDevice(device)) {
    return ["device", "wifi", "qr", "drive"];
  }
  if (isFredProgramDevice(device)) {
    const z21 = skipZ21 ? [] : ["z21"];
    if (fredGuest) {
      return ["accountAsk", "address", ...z21, "programming", "askLoco"];
    }
    return ["accountAsk", "user", "pickRoster", ...z21, "programming", "askLoco"];
  }
  if (isWirelessProgramDevice(device)) {
    const rosterStep = device === "longfred" ? [] : ["pickRoster"];
    return ["device", "user", "pin", "enterPairing", "scan", ...rosterStep, "programming", "done"];
  }
  if (isWlanmausDevice(device)) {
    return ["device", "user", "wifi", "pairing", "driveMode", "loco"];
  }
  if (isRailboxDevice(device)) {
    return ["device", "wifi", "user", "app", "connect", "pairSetup", "pairing", "loco"];
  }
  if (isWithrottleAdvancedDevice(device)) {
    return ["device", "user", "wifi", "pairing", "loco", "howto"];
  }
  return ["device", "user", "pairing", "loco", "howto"];
}

const PHASE_TO_STEPPER: Record<Phase, string> = {
  device: "device",
  phoneWifi: "wifi",
  phoneQr: "qr",
  phoneDrive: "drive",
  user: "user",
  station: "pairing",
  rePairConfirm: "pairing",
  pairing: "pairing",
  wlanmausWifi: "wifi",
  wlanmausDriveMode: "driveMode",
  wlanmausLocoList: "loco",
  railboxAppQr: "app",
  railboxConnect: "connect",
  railboxPairingSetup: "pairSetup",
  railboxLocoList: "loco",
  wtWifi: "wifi",
  pickLoco: "loco",
  howToEnter: "howto",
  wpPin: "pin",
  wpEnterPairing: "enterPairing",
  wpScan: "scan",
  wpRoster: "pickRoster",
  wpProgramming: "programming",
  wpDone: "done",
  wpFailed: "programming",
  fredAccountAsk: "accountAsk",
  fredGuestAddress: "address",
  fredRoster: "pickRoster",
  fredZ21: "z21",
  fredPlug: "programming",
  fredAskLoco: "askLoco",
};

export function activeStepIndexFor(
  phase: Phase,
  labels: string[],
  device: DriveDevice | null,
): number {
  const key = PHASE_TO_STEPPER[phase];
  const resolved =
    (phase === "station" || phase === "rePairConfirm") && device === "wifred" ? "pin" : key;
  const idx = labels.indexOf(resolved);
  return idx < 0 ? 0 : idx;
}

export function stepLabelFor(t: (key: string) => string, key: string): string {
  const programKey = `drive.program.steps.${key}`;
  const translated = t(programKey);
  if (translated !== programKey) return translated;
  return t(`drive.stepper.${key}`);
}
