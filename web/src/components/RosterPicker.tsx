import type { ReactNode } from "react";
import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import type { Vehicle } from "../api/types";

interface Props {
  vehicles: Vehicle[];
  /** Ordered vehicle ids — index+1 is the slot number on the handset. */
  selectedIds: string[];
  maxSlots: number;
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select roster picker. Selection order becomes the slot number
 * shown on the physical handset (1, 2, 3…).
 */
export default function RosterPicker({
  vehicles,
  selectedIds,
  maxSlots,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const atMax = selectedIds.length >= maxSlots;

  const toggle = (id: string) => {
    const idx = selectedIds.indexOf(id);
    if (idx >= 0) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    if (atMax) return;
    onChange([...selectedIds, id]);
  };

  if (vehicles.length === 0) {
    return (
      <Typography color="text.secondary">{t("drive.program.rosterEmpty")}</Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <List disablePadding>
        {vehicles.map((v) => {
          const slot = selectedIds.indexOf(v.id);
          const selected = slot >= 0;
          const disabled = !selected && atMax;
          return (
            <ListItemButton
              key={v.id}
              selected={selected}
              disabled={disabled}
              onClick={() => toggle(v.id)}
              sx={(theme) => ({
                gap: 1,
                py: 1.75,
                px: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
                "&:last-of-type": { borderBottom: "none" },
                "&.Mui-selected": {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                },
              })}
            >
              <ListItemIcon sx={{ minWidth: 48 }}>
                <SlotBadge n={selected ? slot + 1 : null} />
              </ListItemIcon>
              <ListItemText
                primary={v.name}
                secondary={
                  v.dccAddress != null
                    ? t("drive.program.rosterAddress", {
                        address: v.dccAddress,
                        defaultValue: `Address ${v.dccAddress}`,
                      })
                    : undefined
                }
              />
            </ListItemButton>
          );
        })}
      </List>
      {atMax ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
          {t("drive.program.rosterMaxReached", { max: maxSlots })}
        </Typography>
      ) : null}
    </Paper>
  );
}

function SlotBadge({ n }: { n: number | null }): ReactNode {
  if (n == null) {
    return (
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: "grey.200",
          color: "text.disabled",
          fontSize: "1rem",
        }}
      >
       {" "}
      </Avatar>
    );
  }
  return (
    <Avatar
      sx={{
        width: 36,
        height: 36,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        fontWeight: 700,
        fontSize: "1.1rem",
      }}
    >
      {n}
    </Avatar>
  );
}

/** Build wire roster entries from selected vehicles (order = slot order). */
export function rosterFromVehicles(
  vehicles: Vehicle[],
  selectedIds: string[],
): { address: number; longAddress: boolean; direction: number; functions: [] }[] {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const out: { address: number; longAddress: boolean; direction: number; functions: [] }[] = [];
  for (const id of selectedIds) {
    const v = byId.get(id);
    if (!v || v.dccAddress == null) continue;
    out.push({
      address: v.dccAddress,
      longAddress: v.dccAddress >= 128,
      direction: 0,
      functions: [],
    });
  }
  return out;
}
