// Wire shapes shared with BigFred (pkgs/bigfred/server/protocol) and with
// the wizard daemon (src/*.rs). Hand-written on purpose: the kiosk uses a
// tiny slice of the API and must stay buildable without tygo.

export interface WizardConfig {
  enabled: boolean;
  bigfredPublicUrl: string;
  dccPerUser: number;
  idleTimeoutSecs: number;
  ssoClientId: string;
  redirectUris: string[];
  defaultRemoteProtocol: string;
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

export interface Vehicle {
  id: string;
  name: string;
  kind: string;
  dccAddress: number | null;
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
}
