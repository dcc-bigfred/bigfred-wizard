import type { ComponentType } from "react";

import androidLogo from "../assets/drive/android.svg";
import googlePlayLogo from "../assets/drive/google-play.svg";
import otherPhoneLogo from "../assets/drive/other-phone.svg";
import railboxLogo from "../assets/drive/railbox.svg";
import handsetLogo from "../assets/drive/handset.svg";
import wlanmausProduct from "../assets/drive/wlanmaus/product.svg";
import wlanmausOk from "../assets/drive/wlanmaus/ok-key.svg";
import wlanmausSelectLoco from "../assets/drive/wlanmaus/select-loco.svg";
import wlanmausFnKeys from "../assets/drive/wlanmaus/function-keys.svg";

import type { RemoteProtocol } from "../api/types";

export type DriveDevice =
  | "android"
  | "otherPhone"
  | "wlanmaus"
  | "railbox"
  | "longfred"
  | "wifred";

export function isPhoneDevice(d: DriveDevice): boolean {
  return d === "android" || d === "otherPhone";
}

export function protocolForDevice(d: DriveDevice): RemoteProtocol {
  return d === "wlanmaus" ? "z21" : "withrottle";
}

export interface DeviceOption {
  id: DriveDevice;
  image: string;
  /** Optional small badge (e.g. Google Play) shown in the fine print row. */
  badge?: string;
}

export const DEVICE_OPTIONS: DeviceOption[] = [
  { id: "android", image: androidLogo, badge: googlePlayLogo },
  { id: "otherPhone", image: otherPhoneLogo },
  { id: "wlanmaus", image: wlanmausProduct },
  { id: "railbox", image: railboxLogo },
  { id: "longfred", image: handsetLogo },
  { id: "wifred", image: handsetLogo },
];

export const WLANMAUS_ASSETS = {
  ok: wlanmausOk,
  selectLoco: wlanmausSelectLoco,
  functionKeys: wlanmausFnKeys,
};

/** Digits the handset must enter as F0–F9 (or keys 0–9 on WlanMaus). */
export function pairingDigits(input: {
  pairingCode?: string;
  pairingCV3?: number;
  pairingCV4?: number;
  displayLabel: string;
}): string {
  if (input.pairingCode) {
    return input.pairingCode.replace(/\D/g, "");
  }
  if (input.pairingCV3 != null && input.pairingCV4 != null) {
    return `${input.pairingCV3}${input.pairingCV4}`;
  }
  return input.displayLabel.replace(/\D/g, "");
}

/** Physical key label on WlanMaus for a pairing digit (`0`…`9`). */
export function wlanmausKeyForDigit(digit: string): string {
  return digit;
}

export type HowToEnterKey =
  | "wlanmaus"
  | "railbox"
  | "longfred"
  | "wifred"
  | "withrottle";

export function howToEnterKey(device: DriveDevice): HowToEnterKey {
  if (device === "wlanmaus") return "wlanmaus";
  if (device === "railbox") return "railbox";
  if (device === "longfred") return "longfred";
  if (device === "wifred") return "wifred";
  return "withrottle";
}

// Keep TypeScript happy when assets are typed as string URLs.
export type SvgAsset = string;
export type ImgComponent = ComponentType<{ className?: string }>;
