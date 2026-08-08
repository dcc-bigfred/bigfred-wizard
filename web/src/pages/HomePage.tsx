import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import SettingsRemoteIcon from "@mui/icons-material/SettingsRemote";
import GamepadIcon from "@mui/icons-material/Gamepad";
import TrainIcon from "@mui/icons-material/Train";
import type { SvgIconComponent } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";

interface Tile {
  key: string;
  to: string;
  icon: SvgIconComponent;
  color: string;
}

const TILES: Tile[] = [
  { key: "account", to: "/flow/account", icon: PersonAddIcon, color: "#1f6feb" },
  { key: "phone", to: "/flow/phone", icon: PhoneIphoneIcon, color: "#0e7490" },
  { key: "wlanmaus", to: "/flow/wlanmaus", icon: SettingsRemoteIcon, color: "#b45309" },
  { key: "longfred", to: "/flow/longfred", icon: GamepadIcon, color: "#4d7c0f" },
  { key: "loco", to: "/flow/loco", icon: TrainIcon, color: "#7e22ce" },
];

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppShell>
      <Typography variant="h4" sx={{ mb: 3 }}>
        {t("home.heading")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
        }}
      >
        {TILES.map(({ key, to, icon: Icon, color }) => (
          <Card key={key} sx={{ borderLeft: `10px solid ${color}` }}>
            <CardActionArea onClick={() => navigate(to)} sx={{ p: 3, minHeight: 160 }}>
              <Icon sx={{ fontSize: 48, color }} />
              <Typography variant="h5" sx={{ mt: 1 }}>
                {t(`home.tiles.${key}`)}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {t(`home.tiles.${key}Hint`)}
              </Typography>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </AppShell>
  );
}
