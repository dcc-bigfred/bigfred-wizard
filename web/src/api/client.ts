// Every call is same-origin: the wizard daemon serves this bundle and
// reverse-proxies /api/v1/* to BigFred, so there is no CORS to arrange.

import type {
  BigFredVersionInfo,
  CommandStation,
  CvEntry,
  LoginLayout,
  Me,
  ProgrammingResult,
  ProgrammingStatus,
  RemotePairing,
  RemoteProtocol,
  RemoteStatus,
  TokenResponse,
  User,
  Vehicle,
  VehicleCreateInput,
  VehicleTemplate,
  VehicleUpdateInput,
  WizardConfig,
  HandsetSetup,
} from "./types";

export const TOKEN_KEY = "bigfred-wizard.token";
export const STATE_KEY = "bigfred-wizard.oauthState";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Acts as this login (BigFred's X-BigFred-Impersonate-As). */
  as?: string;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (opts.as) {
    headers["X-BigFred-Impersonate-As"] = opts.as;
  }

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  const payload = text ? safeParse(text) : null;
  if (!res.ok) {
    const code =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : undefined) ?? `http_${res.status}`;
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : undefined;
    throw new ApiError(res.status, code, detail);
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  wizardConfig: () => request<WizardConfig>("/api/v1/wizard/config", { auth: false }),

  handsetSetup: () => request<HandsetSetup>("/api/v1/wizard/handset-setup"),

  bigfredVersion: () =>
    request<BigFredVersionInfo>("/api/v1/version", { auth: false }),

  exchangeCode: (code: string, redirectUri: string, state?: string) =>
    request<TokenResponse>("/api/v1/wizard/oauth/token", {
      method: "POST",
      auth: false,
      body: { code, redirectUri, state },
    }),

  me: () => request<Me>("/api/v1/auth/me"),

  layoutsForLogin: () =>
    request<LoginLayout[]>("/api/v1/layouts/login", { auth: false }),

  users: () => request<User[]>("/api/v1/users"),

  createUser: (input: {
    login: string;
    pin: string;
    organization?: string;
    autoAllocateDccCount: number;
  }) =>
    request<User>("/api/v1/users", {
      method: "POST",
      body: {
        login: input.login,
        pin: input.pin,
        organization: input.organization ?? "",
        role: "driver",
        dccPool: [],
        autoAllocateDccCount: input.autoAllocateDccCount,
      },
    }),

  commandStations: (layoutId: number) =>
    request<CommandStation[]>(`/api/v1/layouts/${layoutId}/command-stations`),

  vehicles: (as?: string) => request<Vehicle[]>("/api/v1/vehicles/catalogue", { as }),

  createVehicle: (input: VehicleCreateInput, as: string) =>
    request<Vehicle>("/api/v1/vehicles", {
      method: "POST",
      as,
      body: {
        name: input.name,
        kind: input.kind,
        number: input.number ?? "",
        dccAddress: input.dccAddress,
        carrier: input.carrier ?? "",
        assignment: input.assignment ?? "",
        epoch: input.epoch ?? "",
        revisionDate: input.revisionDate ?? null,
      },
    }),

  updateVehicle: (id: string, input: VehicleUpdateInput, as: string) =>
    request<Vehicle>(`/api/v1/vehicles/${id}`, {
      method: "PUT",
      as,
      body: {
        dccAddress: input.dccAddress,
        dccAddressSet: true,
        carrier: input.carrier ?? "",
        assignment: input.assignment ?? "",
        epoch: input.epoch ?? "",
        revisionDate: input.revisionDate ?? null,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.number !== undefined ? { number: input.number } : {}),
      },
    }),

  vehicleTemplates: () => request<VehicleTemplate[]>("/api/v1/vehicle-templates"),

  attachVehicleTemplate: (vehicleId: string, templateId: number, as: string) =>
    request<unknown>(`/api/v1/vehicles/${vehicleId}/functions/attach`, {
      method: "POST",
      as,
      body: { templateId },
    }),

  addVehicleToLayout: (layoutId: number, vehicleId: string, as: string) =>
    request<unknown>(`/api/v1/layouts/${layoutId}/vehicles`, {
      method: "POST",
      as,
      body: { vehicleId },
    }),

  pulseFunction: (address: number, fn: number, as: string, durationMs = 1000) =>
    request<ProgrammingResult>("/api/v1/wizard/programming/function/pulse", {
      method: "POST",
      body: { address, function: fn, durationMs, as },
    }),

  startPairing: (
    layoutId: number,
    csId: number,
    protocol: RemoteProtocol,
    as: string,
    body: { allowAllVehicles: boolean; vehicleIds: string[] },
  ) =>
    request<RemotePairing>(
      `/api/v1/layouts/${layoutId}/command-stations/${csId}/remotes/${protocol}/pairing`,
      { method: "POST", as, body },
    ),

  cancelPairing: (layoutId: number, csId: number, as: string) =>
    request<void>(`/api/v1/layouts/${layoutId}/command-stations/${csId}/remotes/pairing`, {
      method: "DELETE",
      as,
    }),

  unpairSession: (layoutId: number, csId: number, as: string, clientKey?: string) => {
    const q = clientKey ? `?clientKey=${encodeURIComponent(clientKey)}` : "";
    return request<void>(
      `/api/v1/layouts/${layoutId}/command-stations/${csId}/remotes/session${q}`,
      { method: "DELETE", as },
    );
  },

  remoteStatus: (layoutId: number, csId: number, as: string) =>
    request<RemoteStatus>(
      `/api/v1/layouts/${layoutId}/command-stations/${csId}/remotes/status`,
      { as },
    ),

  programmingStatus: () =>
    request<ProgrammingStatus>("/api/v1/wizard/programming/status"),

  /** Warm the organizer dcc-bus WebSocket if not already connected. */
  connectProgramming: () =>
    request<ProgrammingStatus>("/api/v1/wizard/programming/connect", {
      method: "POST",
    }),

  /** Warm/switch the impersonated drive socket for the selected participant. */
  connectDrive: (asLogin: string) =>
    request<ProgrammingStatus>("/api/v1/wizard/programming/drive-connect", {
      method: "POST",
      body: { as: asLogin },
    }),

  readCvs: (address: number, cvs: number[], mode?: string) =>
    request<ProgrammingResult>("/api/v1/wizard/programming/cvs/read", {
      method: "POST",
      body: { address, cvs, mode },
    }),

  writeCvs: (address: number, cvs: CvEntry[], mode?: string) =>
    request<ProgrammingResult>("/api/v1/wizard/programming/cvs/write", {
      method: "POST",
      body: { address, cvs, mode },
    }),

  getAddress: (address?: number, mode?: string) =>
    request<ProgrammingResult>("/api/v1/wizard/programming/address/get", {
      method: "POST",
      body: { address, mode },
    }),

  setAddress: (address: number, mode?: string, verify = true) =>
    request<ProgrammingResult>("/api/v1/wizard/programming/address/set", {
      method: "POST",
      body: { address, mode, verify },
    }),
};
