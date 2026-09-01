import { ApiError } from "../../api/client";
import type { CommandStation, User, Vehicle, WizardConfig } from "../../api/types";
import type { Candidate } from "../../api/wireless";
import { protocolForDevice, type DriveDevice } from "../../drive/devices";

export function supportsProtocol(station: CommandStation, device: DriveDevice): boolean {
  const protocol = protocolForDevice(device);
  return protocol === "z21" ? station.z21ServerEnabled : station.withrottleServerEnabled;
}

export function friendlyWirelessError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const key = `drive.program.errors.${err.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (err.message) return err.message;
  }
  return t("drive.program.errors.generic");
}

export function fixedZ21Candidate(config: WizardConfig | null | undefined): Candidate | null {
  const z = config?.fredProgramming?.z21;
  if (!z) return null;
  const address = z.address.trim();
  if (!address || z.port === 0) return null;
  const key = `${address}:${z.port}`;
  return { driver: "fred", key, label: key };
}

export function ownedVehicles(list: Vehicle[], user: User): Vehicle[] {
  return list.filter(
    (v) =>
      (v.ownerLogin != null && v.ownerLogin === user.login) ||
      (v.ownerId != null && v.ownerId === user.id),
  );
}
