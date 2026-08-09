import type { ReactNode } from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import { alpha } from "@mui/material/styles";

interface ChoiceListProps {
  children: ReactNode;
  /** Max height with scroll; omit for unbounded. */
  maxHeight?: number | string;
}

/** Outlined list container for single-choice (radio-like) options. */
export function ChoiceList({ children, maxHeight }: ChoiceListProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: "hidden",
        ...(maxHeight != null ? { maxHeight, overflowY: "auto" } : {}),
      }}
    >
      <List disablePadding>{children}</List>
    </Paper>
  );
}

interface ChoiceOptionProps {
  selected: boolean;
  onClick: () => void;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Emphasize primary label (e.g. “add new” row). */
  emphasize?: boolean;
}

/** One selectable row with a radio indicator — kiosk-sized touch target. */
export function ChoiceOption({
  selected,
  onClick,
  primary,
  secondary,
  emphasize,
}: ChoiceOptionProps) {
  return (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={(theme) => ({
        gap: 1,
        py: 1.75,
        px: 2,
        alignItems: "flex-start",
        borderBottom: `1px solid ${theme.palette.divider}`,
        "&:last-of-type": { borderBottom: "none" },
        "&.Mui-selected": {
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          borderLeft: `4px solid ${theme.palette.primary.main}`,
          pl: 1.5,
        },
        "&.Mui-selected:hover": {
          bgcolor: alpha(theme.palette.primary.main, 0.16),
        },
        "&:hover": {
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        },
      })}
    >
      <ListItemIcon sx={{ minWidth: 42, mt: 0.25 }}>
        <Radio
          edge="start"
          checked={selected}
          tabIndex={-1}
          disableRipple
          inputProps={{ "aria-hidden": true }}
          sx={{ pointerEvents: "none" }}
        />
      </ListItemIcon>
      <ListItemText
        primary={primary}
        secondary={secondary}
        primaryTypographyProps={{
          fontWeight: emphasize || selected ? 700 : 500,
          fontSize: "1.15rem",
        }}
        secondaryTypographyProps={{ fontSize: "0.95rem" }}
      />
    </ListItemButton>
  );
}
