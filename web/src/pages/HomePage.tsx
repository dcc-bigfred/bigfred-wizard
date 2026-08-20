import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import DirectionsRailwayIcon from "@mui/icons-material/DirectionsRailway";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import TrainIcon from "@mui/icons-material/Train";
import type { SvgIconComponent } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/AppShell";
import { useHelp } from "../help/HelpContext";

interface NavTile {
  key: string;
  to: string;
  icon: SvgIconComponent;
  color: string;
}

const NAV_TILES: NavTile[] = [
  { key: "account", to: "/flow/account", icon: PersonAddIcon, color: "#1f6feb" },
  { key: "drive", to: "/flow/drive", icon: DirectionsRailwayIcon, color: "#0e7490" },
  { key: "loco", to: "/flow/loco", icon: TrainIcon, color: "#7e22ce" },
];

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showHelp } = useHelp();

  const openGettingStarted = () => {
    const steps = t("help.gettingStarted", { returnObjects: true });
    const items = Array.isArray(steps) ? (steps as string[]) : [];
    showHelp(
      <ol>
        {items.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>,
    );
  };

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
        <Card sx={{ borderLeft: "10px solid #ca8a04" }}>
          <CardActionArea onClick={openGettingStarted} sx={{ p: 3, minHeight: 160 }}>
            <HelpOutlineIcon sx={{ fontSize: 48, color: "#ca8a04" }} />
            <Typography variant="h5" sx={{ mt: 1 }}>
              {t("home.tiles.gettingStarted")}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t("home.tiles.gettingStartedHint")}
            </Typography>
          </CardActionArea>
        </Card>
        {NAV_TILES.map(({ key, to, icon: Icon, color }) => (
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
