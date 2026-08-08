// Every call is same-origin: the wizard daemon serves this bundle and
// reverse-proxies /api/v1/* to BigFred, so there is no CORS to arrange.

import type {
  CommandStation,
  CvEntry,
  Me,
  ProgrammingResult,
  ProgrammingStatus,
  RemotePairing,
  RemoteProtocol,
  RemoteStatus,
  TokenResponse,
  User,
  Vehicle,
  WizardConfig,
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

  exchangeCode: (code: string, redirectUri: string, state?: string) =>
    request<TokenResponse>("/api/v1/wizard/oauth/token", {
      method: "POST",
      auth: false,
      body: { code, redirectUri, state },
    }),

  me: () => request<Me>("/api/v1/auth/me"),

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

  createVehicle: (
    input: { name: string; kind: string; number?: string; dccAddress: number },
    as: string,
  ) =>
    request<Vehicle>("/api/v1/vehicles", {
      method: "POST",
      as,
      body: {
        name: input.name,
        kind: input.kind,
        number: input.number ?? "",
        dccAddress: input.dccAddress,
      },
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

  remoteStatus: (layoutId: number, csId: number, as: string) =>
    request<RemoteStatus>(
      `/api/v1/layouts/${layoutId}/command-stations/${csId}/remotes/status`,
      { as },
    ),

  programmingStatus: () =>
    request<ProgrammingStatus>("/api/v1/wizard/programming/status"),

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
