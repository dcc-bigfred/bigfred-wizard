import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import { api } from "../api/client";
import type { User } from "../api/types";
import { ChoiceList, ChoiceOption } from "./ChoiceList";
import ErrorAlert from "./ErrorAlert";

interface Props {
  selected: User | null;
  onSelect: (user: User) => void;
}

function formatPool(user: User): string {
  if (user.dccPool.length === 0) {
    return "—";
  }
  return user.dccPool.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(", ");
}

export default function UserPicker({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .users()
      .then((list) => !cancelled && setUsers(list))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!users) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    return users
      .filter((u) => u.active && u.role !== "admin")
      .filter((u) => !needle || u.login.toLowerCase().includes(needle));
  }, [users, query]);

  if (error) {
    return <ErrorAlert error={error} />;
  }
  if (!users) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t("pair.pickUser")}
      </Typography>
      <TextField
        label={t("pair.searchUser")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2 }}
      />
      {filtered.length === 0 ? (
        <Typography color="text.secondary">{t("pair.noUsers")}</Typography>
      ) : (
        <ChoiceList maxHeight={380}>
          {filtered.map((user) => (
            <ChoiceOption
              key={user.id}
              selected={selected?.id === user.id}
              onClick={() => onSelect(user)}
              primary={user.login}
              secondary={`DCC: ${formatPool(user)}`}
            />
          ))}
        </ChoiceList>
      )}
    </Box>
  );
}
