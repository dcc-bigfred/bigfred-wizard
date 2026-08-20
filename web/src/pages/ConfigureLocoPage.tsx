import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SentimentSatisfiedAltIcon from "@mui/icons-material/SentimentSatisfiedAlt";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { ChoiceList, ChoiceOption } from "../components/ChoiceList";
import ErrorAlert from "../components/ErrorAlert";
import FlowStepper from "../components/FlowStepper";
import UserPicker from "../components/UserPicker";
import { api, ApiError } from "../api/client";
import {
  VEHICLE_EPOCHS,
  type ProgrammingStatus,
  type User,
  type Vehicle,
  type VehicleEpoch,
  type VehicleTemplate,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useHelp } from "../help/HelpContext";
import programmingTrackImg from "../logos/programming-track.png";

type Phase = "user" | "noPool" | "pickLoco" | "details" | "address" | "program";

interface FredLocoState {
  fromFred?: boolean;
  address?: number;
  userLogin?: string;
  vehicleId?: string;
}

const PROG_MODE = "prog";
const STEPPER_KEYS = ["user", "loco", "address", "program"] as const;
const BASIC_TEMPLATE_NAME = "Basic";

const helpSmileIcon = (
  <SentimentSatisfiedAltIcon
    sx={{ fontSize: "1.25rem", verticalAlign: "text-bottom", mx: 0.25 }}
    aria-hidden
  />
);

function formatPool(user: User): string {
  return user.dccPool
    .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`))
    .join(", ");
}

function inPool(user: User, address: number): boolean {
  return user.dccPool.some((r) => address >= r.from && address <= r.to);
}

/** Catalogue is layout-wide; keep only vehicles owned by the participant. */
function ownedByUser(vehicles: Vehicle[], user: User): Vehicle[] {
  return vehicles.filter(
    (v) =>
      (v.ownerLogin != null && v.ownerLogin === user.login) ||
      (v.ownerId != null && v.ownerId === user.id),
  );
}

/** Lowest free address in the user's pool not already used by a roster vehicle. */
function suggestFreeAddress(user: User, vehicles: Vehicle[], excludeId?: string): number | null {
  const used = new Set<number>();
  for (const v of vehicles) {
    if (excludeId && v.id === excludeId) continue;
    if (v.dccAddress != null) used.add(v.dccAddress);
  }
  for (const range of user.dccPool) {
    for (let a = range.from; a <= range.to; a++) {
      if (!used.has(a)) return a;
    }
  }
  return null;
}

function suggestAddress(user: User, vehicles: Vehicle[], existing: Vehicle | null): number | null {
  if (existing?.dccAddress != null) {
    return existing.dccAddress;
  }
  return suggestFreeAddress(user, vehicles, existing?.id);
}

export default function ConfigureLocoPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { me } = useAuth();
  const { showHelp } = useHelp();
  const fredState = (location.state ?? {}) as FredLocoState;
  const fromFred = Boolean(fredState.fromFred && fredState.address != null);

  const showParagraphHelp = (bodyKey: string, count: number) => {
    showHelp(
      <>
        {Array.from({ length: count }, (_, i) => (
          <Typography
            key={`${bodyKey}-${i}`}
            component="p"
            sx={{ m: 0, "&:not(:last-child)": { mb: 2 } }}
          >
            <Trans i18nKey={`${bodyKey}.${i}`} components={{ smile: helpSmileIcon }} />
          </Typography>
        ))}
      </>,
    );
  };

  const [phase, setPhase] = useState<Phase>(fromFred ? "program" : "user");
  const [user, setUser] = useState<User | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [existing, setExisting] = useState<Vehicle | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const [name, setName] = useState("");
  const [epoch, setEpoch] = useState<VehicleEpoch>("");
  const [carrier, setCarrier] = useState("");
  const [assignment, setAssignment] = useState("");
  const [revisionDate, setRevisionDate] = useState("");

  const [addressText, setAddressText] = useState(
    fromFred && fredState.address != null ? String(fredState.address) : "",
  );
  const [templates, setTemplates] = useState<VehicleTemplate[] | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<VehicleTemplate | null>(null);
  const [savedVehicle, setSavedVehicle] = useState<Vehicle | null>(null);
  const [programmed, setProgrammed] = useState(false);
  const [testingF2, setTestingF2] = useState(false);

  const [status, setStatus] = useState<ProgrammingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .programmingStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fromFred || fredState.address == null) return;
    let cancelled = false;
    (async () => {
      if (!fredState.userLogin) return;
      try {
        const users = await api.users();
        if (cancelled) return;
        const u = users.find((x) => x.login === fredState.userLogin) ?? null;
        setUser(u);
        if (fredState.vehicleId) {
          const list = await api.vehicles(fredState.userLogin);
          if (cancelled) return;
          const v = list.find((x) => x.id === fredState.vehicleId) ?? null;
          setSavedVehicle(v);
          setExisting(v);
          if (v) setName(v.name);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromFred, fredState.address, fredState.userLogin, fredState.vehicleId]);

  useEffect(() => {
    if (phase !== "address") return;
    let cancelled = false;
    // Vehicle already in BigFred — leave template empty so we don't overwrite functions.
    const vehicleExists = existing != null || savedVehicle != null;
    api
      .vehicleTemplates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);
        if (vehicleExists) return;
        const basic = list.find((tpl) => tpl.name === BASIC_TEMPLATE_NAME) ?? null;
        setSelectedTemplate((prev) => prev ?? basic);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, existing, savedVehicle]);

  const address = Number(addressText);
  const addressValid = Number.isInteger(address) && address >= 1 && address <= 10239;
  const addressInPool = user != null && addressValid && inPool(user, address);
  /** True when the loco is already persisted in BigFred (picked or just created). */
  const vehicleExists = existing != null || savedVehicle != null;

  const activeStep = useMemo(() => {
    const map: Record<Phase, (typeof STEPPER_KEYS)[number]> = {
      user: "user",
      noPool: "user",
      pickLoco: "loco",
      details: "loco",
      address: "address",
      program: "program",
    };
    return STEPPER_KEYS.indexOf(map[phase]);
  }, [phase]);

  const loadVehicles = async (picked: User) => {
    setBusy(true);
    setError(null);
    try {
      const list = await api.vehicles(picked.login);
      setVehicles(ownedByUser(list, picked));
      setPhase("pickLoco");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const onUserPicked = (picked: User) => {
    setUser(picked);
    setError(null);
    setExisting(null);
    setAddingNew(false);
    setSavedVehicle(null);
    setProgrammed(false);
    setVehicles(null);
    // Warm the impersonated drive socket for F2 as this participant.
    void api.connectDrive(picked.login).catch(() => {
      /* F2 / diagnostics will surface the error */
    });
    if (picked.dccPool.length === 0) {
      setPhase("noPool");
      return;
    }
    void loadVehicles(picked);
  };

  const goToAddress = (pickedExisting: Vehicle | null) => {
    if (!user) return;
    const list = vehicles ?? [];
    const suggested = suggestAddress(user, list, pickedExisting);
    setAddressText(suggested != null ? String(suggested) : "");
    setSelectedTemplate(null);
    setTemplates(null);
    setPhase("address");
  };

  const onPickExisting = (v: Vehicle) => {
    setExisting(v);
    setAddingNew(false);
    setSavedVehicle(null);
    setProgrammed(false);
    setName(v.name);
    setEpoch((v.epoch as VehicleEpoch) || "");
    setCarrier(v.carrier ?? "");
    setAssignment(v.assignment ?? "");
    setRevisionDate(v.revisionDate ?? "");
    goToAddress(v);
  };

  const onPickAddNew = () => {
    setExisting(null);
    setAddingNew(true);
    setSavedVehicle(null);
    setProgrammed(false);
    setName("");
    setEpoch("");
    setCarrier("");
    setAssignment("");
    setRevisionDate("");
    setPhase("details");
  };

  const onDetailsNext = () => {
    if (!name.trim()) return;
    goToAddress(null);
  };

  const persistAndGoProgram = async () => {
    if (!user || !addressInPool) return;
    setBusy(true);
    setError(null);
    try {
      let vehicle: Vehicle;
      const targetId = savedVehicle?.id ?? existing?.id;
      if (!targetId) {
        vehicle = await api.createVehicle(
          {
            name: name.trim(),
            kind: "loco",
            dccAddress: address,
            carrier: carrier.trim() || undefined,
            assignment: assignment.trim() || undefined,
            epoch: epoch || undefined,
            revisionDate: revisionDate.trim() || null,
          },
          user.login,
        );
      } else {
        const metaSource = savedVehicle ?? existing;
        vehicle = await api.updateVehicle(
          targetId,
          {
            dccAddress: address,
            carrier: metaSource?.carrier ?? carrier.trim(),
            assignment: metaSource?.assignment ?? assignment.trim(),
            epoch: metaSource?.epoch ?? epoch,
            revisionDate: metaSource?.revisionDate ?? (revisionDate.trim() || null),
            name: metaSource?.name ?? name.trim(),
            kind: metaSource?.kind ?? "loco",
            number: metaSource?.number ?? "",
          },
          user.login,
        );
      }
      setSavedVehicle(vehicle);
      if (selectedTemplate) {
        await api.attachVehicleTemplate(vehicle.id, selectedTemplate.id, user.login);
      }
      setProgrammed(false);
      setPhase("program");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const programAddress = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setAddress(address, PROG_MODE, true);
      setProgrammed(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const testF2 = async () => {
    if (!me || !savedVehicle || !user) return;
    setTestingF2(true);
    setError(null);
    try {
      try {
        await api.addVehicleToLayout(me.layoutId, savedVehicle.id, user.login);
      } catch (err) {
        // Idempotent: the loco is already on this layout's roster. Only
        // swallow that exact case — a generic 409 (e.g. a conflict from a
        // different vehicle) must still surface.
        const alreadyOnRoster =
          err instanceof ApiError && err.code === "layout_vehicle_already_on_roster";
        if (!alreadyOnRoster) {
          throw err;
        }
        console.warn("addVehicleToLayout: already on roster, continuing to F2 pulse", {
          layoutId: me.layoutId,
          vehicleId: savedVehicle.id,
        });
      }
      await api.pulseFunction(address, 2, user.login, 1000);
    } catch (err) {
      setError(err);
    } finally {
      setTestingF2(false);
    }
  };

  const goBack = () => {
    setError(null);
    switch (phase) {
      case "user":
        navigate("/");
        break;
      case "noPool":
        setUser(null);
        setPhase("user");
        break;
      case "pickLoco":
        setUser(null);
        setVehicles(null);
        setPhase("user");
        break;
      case "details":
        setAddingNew(false);
        setPhase("pickLoco");
        break;
      case "address":
        if (addingNew) {
          setPhase("details");
        } else {
          setExisting(null);
          setPhase("pickLoco");
        }
        break;
      case "program":
        if (fromFred) {
          navigate("/");
          break;
        }
        // Vehicle already persisted — allow editing address again (re-save on Next).
        // Clear template so Dalej does not re-attach and overwrite functions.
        setProgrammed(false);
        setSelectedTemplate(null);
        setPhase("address");
        break;
      default:
        navigate("/");
    }
  };

  return (
    <AppShell title={t("loco.heading")} showBack>
      <FlowStepper
        activeStep={activeStep}
        labels={STEPPER_KEYS.map((key) => t(`loco.steps.${key}`))}
      />

      <Paper sx={{ p: 4 }}>
        <ErrorAlert error={error} />
        {status && !status.connected && status.commandStationId === undefined && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t("loco.programmingOffline")}
          </Alert>
        )}

        {phase === "user" && (
          <UserPicker
            selected={user}
            onSelect={onUserPicked}
          />
        )}

        {phase === "noPool" && (
          <Alert severity="warning">{t("loco.noDccPool")}</Alert>
        )}

        {phase === "pickLoco" && (
          <Box>
            <Typography variant="h5" sx={{ mb: 1 }}>
              {t("loco.pickLoco")}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t("loco.pickLocoHint")}
            </Typography>
            {vehicles === null || busy ? (
              <CircularProgress />
            ) : (
              <ChoiceList maxHeight={420}>
                <ChoiceOption
                  selected={addingNew}
                  onClick={onPickAddNew}
                  primary={t("loco.addNewLoco")}
                  emphasize
                />
                {vehicles.map((v) => (
                  <ChoiceOption
                    key={v.id}
                    selected={existing?.id === v.id}
                    onClick={() => onPickExisting(v)}
                    primary={v.name}
                    secondary={
                      v.dccAddress != null
                        ? t("loco.locoAddress", { address: v.dccAddress })
                        : t("loco.locoNoAddress")
                    }
                  />
                ))}
              </ChoiceList>
            )}
          </Box>
        )}

        {phase === "details" && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3 }}>
              {t("loco.detailsTitle")}
            </Typography>
            <Stack spacing={3}>
              <TextField
                required
                label={t("loco.vehicleName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <TextField
                select
                label={t("loco.epoch")}
                value={epoch}
                onChange={(e) => setEpoch(e.target.value as VehicleEpoch)}
              >
                <MenuItem value="">
                  <em>{t("loco.epochUnset")}</em>
                </MenuItem>
                {VEHICLE_EPOCHS.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("loco.carrier")}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
              <TextField
                label={t("loco.assignment")}
                value={assignment}
                onChange={(e) => setAssignment(e.target.value)}
              />
              <TextField
                label={t("loco.revisionDate")}
                type="date"
                value={revisionDate}
                onChange={(e) => setRevisionDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          </Box>
        )}

        {phase === "address" && user && (
          <Box>
            <Typography sx={{ mb: 2, fontSize: "1.1rem" }}>
              <Trans
                i18nKey="loco.addressExplain"
                values={{ address: addressText || "—" }}
                components={{ strong: <strong /> }}
              />
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t("loco.poolHint", { ranges: formatPool(user) || "—" })}
            </Typography>
            <TextField
              label={t("loco.dccAddress")}
              value={addressText}
              onChange={(e) => setAddressText(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              fullWidth
              sx={{ maxWidth: 280, mb: 3 }}
            />
            {addressValid && !addressInPool && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {t("loco.outsidePool")}
              </Alert>
            )}
            {vehicleExists ? (
              <Accordion
                disableGutters
                elevation={0}
                sx={{
                  mt: 1,
                  bgcolor: "transparent",
                  "&:before": { display: "none" },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                  <Typography>{t("loco.functionListChangeOptional")}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, pt: 0 }}>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    {t("loco.functionListDescribe")}
                  </Typography>
                  <Autocomplete
                    options={templates ?? []}
                    loading={templates === null}
                    value={selectedTemplate}
                    onChange={(_e, value) => setSelectedTemplate(value)}
                    getOptionLabel={(opt) => opt.name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField {...params} label={t("loco.functionList")} />
                    )}
                  />
                </AccordionDetails>
              </Accordion>
            ) : (
              <>
                <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
                  {t("loco.functionListHeading")}
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  {t("loco.functionListDescribe")}
                </Typography>
                <Autocomplete
                  options={templates ?? []}
                  loading={templates === null}
                  value={selectedTemplate}
                  onChange={(_e, value) => setSelectedTemplate(value)}
                  getOptionLabel={(opt) => opt.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(params) => (
                    <TextField {...params} label={t("loco.functionList")} />
                  )}
                />
              </>
            )}
          </Box>
        )}

        {phase === "program" && (
          <Box>
            {programmed ? (
              <>
                <Alert severity="success" sx={{ mb: 2 }}>
                  {t("loco.programSuccess", {
                    address,
                    name: savedVehicle?.name ?? name,
                  })}
                </Alert>
                {user ? (
                  <>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {t("loco.testF2Hint")}
                    </Alert>
                    <Button
                      variant="outlined"
                      disabled={testingF2 || busy || !savedVehicle}
                      onClick={() => void testF2()}
                      sx={{ mb: 2 }}
                    >
                      {testingF2 ? (
                        <CircularProgress size={22} color="inherit" />
                      ) : (
                        t("loco.testF2")
                      )}
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Alert
                  severity="info"
                  sx={{
                    mb: 2,
                    "& .MuiAlert-message": {
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      lineHeight: 1.4,
                    },
                  }}
                >
                  {t("loco.putOnTrackProgram")}
                </Alert>
                <Box
                  component="img"
                  src={programmingTrackImg}
                  alt=""
                  sx={{
                    display: "block",
                    width: "100%",
                    maxWidth: 520,
                    height: "auto",
                    borderRadius: 2,
                    mx: "auto",
                    opacity: 0.7,
                  }}
                />
              </>
            )}
          </Box>
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 4 }} justifyContent="space-between">
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" onClick={goBack} disabled={busy}>
              {phase === "user" ? t("app.cancel") : t("app.back")}
            </Button>
            {phase === "user" && (
              <Button variant="text" onClick={() => showParagraphHelp("loco.whyPickUserBody", 2)}>
                {t("loco.whyPickUser")}
              </Button>
            )}
            {phase === "address" && (
              <Button variant="text" onClick={() => showParagraphHelp("loco.whereDccNumberBody", 3)}>
                {t("loco.whereDccNumber")}
              </Button>
            )}
          </Stack>

          {phase === "noPool" && (
            <Button variant="contained" onClick={() => navigate("/")}>
              {t("app.finish")}
            </Button>
          )}

          {phase === "details" && (
            <Button
              variant="contained"
              disabled={busy || name.trim().length === 0}
              onClick={onDetailsNext}
            >
              {t("app.next")}
            </Button>
          )}

          {phase === "address" && (
            <Button
              variant="contained"
              disabled={busy || !addressInPool}
              onClick={() => void persistAndGoProgram()}
            >
              {busy ? <CircularProgress size={22} color="inherit" /> : t("app.next")}
            </Button>
          )}

          {phase === "program" && !programmed && (
            <Button variant="contained" disabled={busy} onClick={() => void programAddress()}>
              {busy ? <CircularProgress size={22} color="inherit" /> : t("loco.program")}
            </Button>
          )}

          {phase === "program" && programmed && (
            <Button variant="contained" disabled={testingF2} onClick={() => navigate("/")}>
              {t("app.finish")}
            </Button>
          )}
        </Stack>
      </Paper>
    </AppShell>
  );
}
