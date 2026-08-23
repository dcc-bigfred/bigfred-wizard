// Wire shapes shared with BigFred (pkgs/bigfred/server/protocol) and with
// the wizard daemon (src/*.rs). Hand-written on purpose: the kiosk uses a
// tiny slice of the API and must stay buildable without tygo.

export interface WizardConfig {
  enabled: boolean;
  bigfredPublicUrl: string;
  androidAppUrl: string;
  dccPerUser: number;
  idleTimeoutSecs: number;
  ssoClientId: string;
  redirectUris: string[];
  defaultRemoteProtocol: string;
  /** WiFi SSID for handset commissioning (empty until configured). */
  wifiSsid: string;
  /** Whether a WiFi PSK is configured (never the raw secret). */
  wifiPskConfigured: boolean;
  throttleServerHost: string;
  throttleServerPort: number;
  throttleServerAutomatic: boolean;
  fredProgramming: {
    z21: { address: string; port: number };
  };
  locoProgramming: {
    mode: "bigfred" | "direct";
    z21: { address: string; port: number };
    dccBusId?: number;
    layoutId?: number;
  };
}

export interface HandsetSetup {
  wifiSsid: string;
  wifiPsk: string;
  bigfredHost: string;
  bigfredIpv4?: string;
}

/** Payload from BigFred GET /api/v1/version (proxied). */
export interface BigFredVersionInfo {
  version: string;
  tagCommit?: string;
  buildCommit?: string;
  buildTime?: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
}

export type Role = "driver" | "signalman" | "admin";

export interface Me {
  id: number;
  login: string;
  role: Role;
  effectiveRole: Role;
  layoutId: number;
  layoutName: string;
}

/** Public row from GET /api/v1/layouts/login (pre-SSO makieta picker). */
export interface LoginLayout {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface DccPoolRange {
  from: number;
  to: number;
}

export interface User {
  id: number;
  login: string;
  organization: string;
  role: Role;
  active: boolean;
  dccPool: DccPoolRange[];
}

export interface CommandStation {
  id: number;
  name: string;
  kind: string;
  z21ServerEnabled: boolean;
  withrottleServerEnabled: boolean;
  programming: boolean;
  hideInThrottle: boolean;
  defaultProgrammingTrackOutput: string;
}

export type VehicleEpoch =
  | ""
  | "I"
  | "Ia"
  | "Ib"
  | "II"
  | "IIa"
  | "IIb"
  | "IIc"
  | "III"
  | "IIIa"
  | "IIIb"
  | "IIIc"
  | "IV"
  | "IVa"
  | "IVb"
  | "IVc"
  | "V"
  | "Va"
  | "Vb"
  | "Vc"
  | "VI"
  | "VIa"
  | "VIb";

/** Polish modelling epochs (I…VIb), matching BigFred domain.VehicleEpoch. */
export const VEHICLE_EPOCHS: Exclude<VehicleEpoch, "">[] = [
  "I",
  "Ia",
  "Ib",
  "II",
  "IIa",
  "IIb",
  "IIc",
  "III",
  "IIIa",
  "IIIb",
  "IIIc",
  "IV",
  "IVa",
  "IVb",
  "IVc",
  "V",
  "Va",
  "Vb",
  "Vc",
  "VI",
  "VIa",
  "VIb",
];

export interface Vehicle {
  id: string;
  name: string;
  kind: string;
  number?: string;
  dccAddress: number | null;
  ownerId?: number;
  ownerLogin?: string;
  carrier?: string;
  assignment?: string;
  revisionDate?: string | null;
  epoch?: string;
}

export interface VehicleCreateInput {
  name: string;
  kind: string;
  number?: string;
  dccAddress: number;
  carrier?: string;
  assignment?: string;
  epoch?: string;
  revisionDate?: string | null;
}

export interface VehicleUpdateInput {
  dccAddress: number;
  /** Echoed catalogue metadata — BigFred Update always applies these fields. */
  carrier?: string;
  assignment?: string;
  epoch?: string;
  revisionDate?: string | null;
  name?: string;
  kind?: string;
  number?: string;
}

export interface VehicleTemplate {
  id: number;
  name: string;
  description?: string;
}

export type RemoteProtocol = "z21" | "withrottle";

export interface RemotePairing {
  protocol: RemoteProtocol;
  pairingCV3?: number;
  pairingCV4?: number;
  pairingCode?: string;
  displayLabel: string;
  expiresAt: number;
  instructions: string;
}

export interface RemoteStatus {
  protocol?: string;
  paired: boolean;
  clientKey?: string;
  allowAllVehicles: boolean;
  pendingPairing?: unknown;
}

export interface CvEntry {
  cv: number;
  value: number;
}

export interface ProgrammingResult {
  ok: boolean;
  error?: string;
  cvs?: CvEntry[];
  locoAddress?: number;
  longAddress?: boolean;
  commandStationId?: number;
}

export interface ProgrammingStatus {
  connected: boolean;
  commandStationId?: number;
  commandStationName?: string;
  defaultProgrammingTrackOutput?: string;
  lastError?: string;
  reconnects: number;
  driveConnected?: boolean;
  driveAs?: string;
}
