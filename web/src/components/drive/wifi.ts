import type { HandsetSetup } from "../../api/types";

/** PSK for on-screen instructions; empty PSK is an open network. */
export function wifiPasswordDisplay(
  setup: HandsetSetup | null | undefined,
  openNetworkLabel: string,
): string {
  const psk = setup?.wifiPsk?.trim() ?? "";
  return psk || openNetworkLabel;
}

export function wifiSsidDisplay(setup: HandsetSetup | null | undefined): string {
  const ssid = setup?.wifiSsid?.trim() ?? "";
  return ssid || "—";
}
