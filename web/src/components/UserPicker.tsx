import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
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
      <ChoiceList maxHeight={380}>
        <ChoiceOption
          selected={false}
          emphasize
          onClick={() => navigate("/flow/account")}
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PersonAddIcon color="primary" />
              {t("pair.accountMissing")}
            </Box>
          }
          secondary={t("pair.accountMissingHint")}
        />
        {filtered.length === 0 ? (
          <Box sx={{ px: 2, py: 2 }}>
            <Typography color="text.secondary">{t("pair.noUsers")}</Typography>
          </Box>
        ) : (
          filtered.map((user) => (
            <ChoiceOption
              key={user.id}
              selected={selected?.id === user.id}
              onClick={() => onSelect(user)}
              primary={user.login}
              secondary={`DCC: ${formatPool(user)}`}
            />
          ))
        )}
      </ChoiceList>
    </Box>
  );
}
