// Client for /api/v1/wizard/wireless/* — physical handset commissioning.

import { ApiError, getToken } from "./client";

export interface Capabilities {
  maxRosterSlots: number;
  maxFunctionIndex: number;
  identityFormat:
    | { digits: { len: number } }
    | { alphanumeric: { max_len: number } }
    | "any";
  supportsThrottleServer: boolean;
  commissioning: "softAp" | "lan" | "serial";
  commissioningNet?: {
    host: string;
    port: number;
    source: string;
    prefix: number;
  };
}

export interface DriverInfo {
  id: string;
  name: string;
  capabilities: Capabilities;
}

export interface HelloResult {
  version: string;
  commit?: string;
  drivers: DriverInfo[];
}

export interface LinkStatus {
  busy: boolean;
  interface?: string;
  rfkillBlocked: boolean;
}

export interface Candidate {
  driver: string;
  key: string;
  label: string;
  rssi?: number;
}

export interface FunctionMapping {
  index: number;
  value: number;
}

export interface RosterEntry {
  address?: number | null;
  longAddress?: boolean | null;
  mode?: string | null;
  direction?: number | null;
  functions?: FunctionMapping[];
}

export interface BigfredCreds {
  login: string;
  pin: string;
}

export interface ProgramFromWizard {
  candidate: { driver: string; key: string };
  identity: string;
  roster: RosterEntry[];
  bigfred?: BigfredCreds;
  rosterMode?: string;
}

export interface ProgramResult {
  jobId: string;
}

export type JobState =
  | "queued"
  | "joining"
  | "probing"
  | "writing"
  | "verifying"
  | "restarting"
  | "done"
  | "failed"
  | "cancelled";

export interface JobFrame {
  jobId: string;
  state: JobState;
  step?: string;
  progress?: number;
  detail?: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as object) } });
  const text = await res.text();
  const payload = text ? safeParse(text) : null;
  if (!res.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: string }).error)
        : `http_${res.status}`;
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: string }).detail)
        : undefined;
    throw new ApiError(res.status, code, detail);
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const wirelessApi = {
  hello: () => requestJson<HelloResult>("/api/v1/wizard/wireless/hello"),
  linkStatus: () => requestJson<LinkStatus>("/api/v1/wizard/wireless/link-status"),
  scan: (mode?: "z21") =>
    requestJson<Candidate[]>(
      mode ? `/api/v1/wizard/wireless/scan?mode=${encodeURIComponent(mode)}` : "/api/v1/wizard/wireless/scan",
    ),
  program: (body: ProgramFromWizard) =>
    requestJson<ProgramResult>("/api/v1/wizard/wireless/program", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancel: (jobId: string) =>
    requestJson<{ jobId: string }>(`/api/v1/wizard/wireless/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    }),

  /**
   * Open an SSE stream of job frames. Calls `onFrame` for every progress
   * event and resolves with the terminal frame (or rejects on stream error).
   */
  watchJob(
    jobId: string,
    onFrame: (frame: JobFrame) => void,
    signal?: AbortSignal,
  ): Promise<JobFrame> {
    return new Promise((resolve, reject) => {
      const url = `/api/v1/wizard/wireless/jobs/${encodeURIComponent(jobId)}/events`;
      const es = new EventSource(url);
      let last: JobFrame | null = null;

      const cleanup = () => {
        es.close();
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new ApiError(499, "cancelled", "aborted"));
      };
      signal?.addEventListener("abort", onAbort);

      es.addEventListener("frame", (ev) => {
        try {
          const frame = JSON.parse((ev as MessageEvent).data) as JobFrame;
          last = frame;
          onFrame(frame);
          if (frame.state === "done" || frame.state === "failed" || frame.state === "cancelled") {
            cleanup();
            resolve(frame);
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      es.addEventListener("error", (ev) => {
        // EventSource fires "error" both for network issues and for our
        // custom error events. Prefer a parseable payload when present.
        const data = (ev as MessageEvent).data;
        cleanup();
        if (typeof data === "string" && data) {
          try {
            const body = JSON.parse(data) as { code?: string; message?: string };
            reject(new ApiError(502, body.code ?? "wireless_io", body.message));
            return;
          } catch {
            /* fall through */
          }
        }
        if (last && (last.state === "done" || last.state === "failed" || last.state === "cancelled")) {
          resolve(last);
          return;
        }
        reject(new ApiError(502, "wireless_io", "stream closed"));
      });
    });
  },
};

export function driverCapabilities(
  hello: HelloResult,
  driverId: string,
): Capabilities | undefined {
  return hello.drivers.find((d) => d.id === driverId)?.capabilities;
}

/** Generate a LongFred hostname (alphanumeric, ≤16). */
export function generateLongfredIdentity(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `lf${suffix}`;
}
