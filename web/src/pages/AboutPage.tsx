import { useCallback, useEffect, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useTranslation } from "react-i18next";

import { api, ApiError } from "../api/client";
import type { BigFredVersionInfo, ProgrammingStatus, WizardConfig } from "../api/types";
import { wirelessApi, type HelloResult, type LinkStatus } from "../api/wireless";
import AppShell from "../components/AppShell";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

function errMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function StatusChip({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <Chip
      size="small"
      color={ok ? "success" : "error"}
      label={ok ? okLabel : badLabel}
      sx={{ fontWeight: 600 }}
    />
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "11rem 1fr" },
        gap: { xs: 0.25, sm: 2 },
        alignItems: "baseline",
        py: 0.75,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body1"
        component="div"
        sx={{ wordBreak: "break-word", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} spacing={1}>
        <Typography variant="h6">{title}</Typography>
        {action}
      </Stack>
      <Divider sx={{ mb: 1.5 }} />
      {children}
    </Paper>
  );
}

export default function AboutPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LoadState<WizardConfig>>({ status: "loading" });
  const [bigfred, setBigfred] = useState<LoadState<BigFredVersionInfo>>({ status: "loading" });
  const [dccbus, setDccbus] = useState<LoadState<ProgrammingStatus>>({ status: "loading" });
  const [wpHello, setWpHello] = useState<LoadState<HelloResult>>({ status: "loading" });
  const [wpLink, setWpLink] = useState<LoadState<LinkStatus>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setConfig({ status: "loading" });
    setBigfred({ status: "loading" });
    setDccbus({ status: "loading" });
    setWpHello({ status: "loading" });
    setWpLink({ status: "loading" });

    const wrap = async <T,>(
      promise: Promise<T>,
      set: (s: LoadState<T>) => void,
    ) => {
      try {
        set({ status: "ok", data: await promise });
      } catch (err) {
        set({ status: "error", message: errMessage(err) });
      }
    };

    await Promise.all([
      wrap(api.wizardConfig(), setConfig),
      wrap(api.bigfredVersion(), setBigfred),
      wrap(api.programmingStatus(), setDccbus),
      wrap(wirelessApi.hello(), setWpHello),
      wrap(wirelessApi.linkStatus(), setWpLink),
    ]);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title={t("about.heading")} showBack>
      <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={18} /> : <RefreshIcon />}
            onClick={() => void load()}
            disabled={refreshing}
          >
            {t("about.refresh")}
          </Button>
        </Stack>

        <Section title={t("about.wizard")}>
          {config.status === "loading" && <CircularProgress size={28} />}
          {config.status === "error" && <Alert severity="error">{config.message}</Alert>}
          {config.status === "ok" && (
            <>
              <Row label={t("about.enabled")}>
                <StatusChip
                  ok={config.data.enabled}
                  okLabel={t("about.yes")}
                  badLabel={t("about.no")}
                />
              </Row>
              <Row label={t("about.bigfredUrl")}>{config.data.bigfredPublicUrl || "—"}</Row>
              <Row label={t("about.androidAppUrl")}>
                {config.data.androidAppUrl.trim() || t("about.unset")}
              </Row>
              <Row label={t("about.ssoClientId")}>{config.data.ssoClientId}</Row>
              <Row label={t("about.defaultProtocol")}>{config.data.defaultRemoteProtocol}</Row>
              <Row label={t("about.redirectUris")}>
                {config.data.redirectUris.length
                  ? config.data.redirectUris.join("\n")
                  : "—"}
              </Row>
            </>
          )}
        </Section>

        <Section
          title={t("about.bigfred")}
          action={
            bigfred.status === "ok" ? (
              <StatusChip ok okLabel={t("about.connected")} badLabel={t("about.disconnected")} />
            ) : bigfred.status === "error" ? (
              <StatusChip
                ok={false}
                okLabel={t("about.connected")}
                badLabel={t("about.disconnected")}
              />
            ) : undefined
          }
        >
          {bigfred.status === "loading" && <CircularProgress size={28} />}
          {bigfred.status === "error" && <Alert severity="error">{bigfred.message}</Alert>}
          {bigfred.status === "ok" && (
            <>
              <Row label={t("about.version")}>{bigfred.data.version}</Row>
              <Row label={t("about.tagCommit")}>{bigfred.data.tagCommit || "—"}</Row>
              <Row label={t("about.buildCommit")}>{bigfred.data.buildCommit || "—"}</Row>
              <Row label={t("about.buildTime")}>{bigfred.data.buildTime || "—"}</Row>
            </>
          )}
        </Section>

        <Section
          title={t("about.dccbus")}
          action={
            dccbus.status === "ok" ? (
              <StatusChip
                ok={dccbus.data.connected}
                okLabel={t("about.connected")}
                badLabel={t("about.disconnected")}
              />
            ) : dccbus.status === "error" ? (
              <StatusChip
                ok={false}
                okLabel={t("about.connected")}
                badLabel={t("about.disconnected")}
              />
            ) : undefined
          }
        >
          {dccbus.status === "loading" && <CircularProgress size={28} />}
          {dccbus.status === "error" && <Alert severity="error">{dccbus.message}</Alert>}
          {dccbus.status === "ok" && (
            <>
              <Row label={t("about.commandStation")}>
                {dccbus.data.commandStationName
                  ? `${dccbus.data.commandStationName} (#${dccbus.data.commandStationId ?? "—"})`
                  : t("about.none")}
              </Row>
              <Row label={t("about.progOutput")}>
                {dccbus.data.defaultProgrammingTrackOutput || "—"}
              </Row>
              <Row label={t("about.reconnects")}>{String(dccbus.data.reconnects)}</Row>
              <Row label={t("about.lastError")}>{dccbus.data.lastError || "—"}</Row>
              <Row label={t("about.driveSocket")}>
                <StatusChip
                  ok={Boolean(dccbus.data.driveConnected)}
                  okLabel={t("about.connected")}
                  badLabel={t("about.disconnected")}
                />
              </Row>
              <Row label={t("about.driveAs")}>{dccbus.data.driveAs || "—"}</Row>
            </>
          )}
        </Section>

        <Section title={t("about.wifi")}>
          {config.status === "loading" && <CircularProgress size={28} />}
          {config.status === "error" && <Alert severity="error">{config.message}</Alert>}
          {config.status === "ok" && (
            <>
              <Row label={t("about.wifiSsid")}>
                {config.data.wifiSsid.trim() || t("about.unset")}
              </Row>
              <Row label={t("about.wifiPsk")}>
                <StatusChip
                  ok={config.data.wifiPskConfigured}
                  okLabel={t("about.pskSet")}
                  badLabel={t("about.pskOpen")}
                />
              </Row>
              <Row label={t("about.throttleHost")}>{config.data.throttleServerHost}</Row>
              <Row label={t("about.throttlePort")}>{String(config.data.throttleServerPort)}</Row>
              <Row label={t("about.throttleAuto")}>
                {config.data.throttleServerAutomatic ? t("about.yes") : t("about.no")}
              </Row>
            </>
          )}
        </Section>

        <Section
          title={t("about.wireless")}
          action={
            wpHello.status === "ok" ? (
              <StatusChip ok okLabel={t("about.connected")} badLabel={t("about.disconnected")} />
            ) : wpHello.status === "error" ? (
              <StatusChip
                ok={false}
                okLabel={t("about.connected")}
                badLabel={t("about.disconnected")}
              />
            ) : undefined
          }
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {t("about.wirelessHello")}
          </Typography>
          {wpHello.status === "loading" && <CircularProgress size={28} />}
          {wpHello.status === "error" && <Alert severity="error">{wpHello.message}</Alert>}
          {wpHello.status === "ok" && (
            <>
              <Row label={t("about.version")}>{wpHello.data.version}</Row>
              <Row label={t("about.commit")}>{wpHello.data.commit || "—"}</Row>
              <Row label={t("about.drivers")}>
                {wpHello.data.drivers.length
                  ? wpHello.data.drivers.map((d) => d.id).join(", ")
                  : "—"}
              </Row>
            </>
          )}

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
            {t("about.wirelessLink")}
          </Typography>
          {wpLink.status === "loading" && <CircularProgress size={28} />}
          {wpLink.status === "error" && <Alert severity="error">{wpLink.message}</Alert>}
          {wpLink.status === "ok" && (
            <>
              <Row label={t("about.interface")}>{wpLink.data.interface || t("about.none")}</Row>
              <Row label={t("about.busy")}>
                {wpLink.data.busy ? t("about.yes") : t("about.no")}
              </Row>
              <Row label={t("about.rfkill")}>
                <StatusChip
                  ok={!wpLink.data.rfkillBlocked}
                  okLabel={t("about.rfkillOk")}
                  badLabel={t("about.rfkillBlocked")}
                />
              </Row>
            </>
          )}
        </Section>
      </Stack>
    </AppShell>
  );
}
