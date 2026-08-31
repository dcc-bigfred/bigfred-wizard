/**
 * First drive-flow screen: pick a handset / phone / programmer.
 * Also offers the “what should I choose?” help overlay.
 */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useTranslation } from "react-i18next";

import { DEVICE_OPTIONS, type DriveDevice } from "../../../drive/devices";
import { useHelp } from "../../../help/HelpContext";

export default function DevicePicker({ onPick }: { onPick: (id: DriveDevice) => void }) {
  const { t } = useTranslation();
  const { showHelp } = useHelp();

  const openWhatToChoose = () => {
    const paragraphs = t("drive.whatToChooseBody", { returnObjects: true });
    const items = Array.isArray(paragraphs) ? (paragraphs as string[]) : [];
    showHelp(
      <>
        {items.map((paragraph) => (
          <Typography key={paragraph} component="p" sx={{ m: 0, "&:not(:last-child)": { mb: 2 } }}>
            {paragraph}
          </Typography>
        ))}
      </>,
    );
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t("drive.pickDevice")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("drive.pickDeviceHint")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        <Card variant="outlined" sx={{ borderLeft: "10px solid #ca8a04" }}>
          <CardActionArea onClick={openWhatToChoose} sx={{ p: 2.5, minHeight: 140 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <HelpOutlineIcon sx={{ fontSize: 48, color: "#ca8a04" }} />
              </Box>
              <Box>
                <Typography variant="h6">{t("drive.whatToChoose")}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t("drive.whatToChooseHint")}
                </Typography>
              </Box>
            </Stack>
          </CardActionArea>
        </Card>
        {DEVICE_OPTIONS.map((opt) => (
          <Card key={opt.id} variant="outlined">
            <CardActionArea onClick={() => onPick(opt.id)} sx={{ p: 2.5, minHeight: 140 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  component="img"
                  src={opt.image}
                  alt=""
                  sx={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0 }}
                />
                <Box>
                  <Typography variant="h6">{t(`drive.devices.${opt.id}.title`)}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {opt.badge && (
                      <Box
                        component="img"
                        src={opt.badge}
                        alt=""
                        sx={{
                          width: 18,
                          height: 18,
                          verticalAlign: "middle",
                          mr: 0.5,
                          display: "inline-block",
                        }}
                      />
                    )}
                    {t(`drive.devices.${opt.id}.hint`)}
                  </Typography>
                </Box>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
