/**
 * Wireless-programmer: put the handset into pairing / Soft-AP mode.
 * WiFred shows fixed numbered steps; LongFred picks a hardware variant first.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import NumberedSteps, { type NumberedStep } from "../../NumberedSteps";
import {
  DEVICE_OPTIONS,
  LONGFRED_VARIANTS,
  type DriveDevice,
  type LongFredVariantId,
} from "../../../drive/devices";

export default function EnterPairingStep({
  device,
  variant,
  onVariant,
  onContinue,
  onBack,
}: {
  device: DriveDevice;
  variant: LongFredVariantId | null;
  onVariant: (id: LongFredVariantId) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  if (device === "wifred") {
    const steps: NumberedStep[] = [1, 2].map((n) => ({
      body: t(`drive.program.wifredEnter.${n}`),
    }));
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {t("drive.program.enterPairingTitle")}
        </Typography>
        <Box
          component="img"
          src={DEVICE_OPTIONS.find((o) => o.id === "wifred")?.image}
          alt=""
          sx={{ width: 160, height: 160, objectFit: "contain", mb: 2, display: "block", mx: "auto" }}
        />
        <NumberedSteps steps={steps} />
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
          <Button variant="outlined" onClick={onBack}>
            {t("app.back")}
          </Button>
          <Button variant="contained" onClick={onContinue}>
            {t("drive.program.enterPairingContinue")}
          </Button>
        </Stack>
      </Box>
    );
  }

  const selected = LONGFRED_VARIANTS.find((v) => v.id === variant) ?? null;
  const canContinue = selected != null;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t("drive.program.pickVariantTitle")}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          mb: 3,
        }}
      >
        {LONGFRED_VARIANTS.map((v) => (
          <Card
            key={v.id}
            variant="outlined"
            sx={{
              borderColor: variant === v.id ? "primary.main" : undefined,
              borderWidth: variant === v.id ? 2 : 1,
            }}
          >
            <CardActionArea onClick={() => onVariant(v.id)} sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  component="img"
                  src={v.image}
                  alt=""
                  sx={{ width: 72, height: 72, objectFit: "contain" }}
                />
                <Typography variant="h6">
                  {t(`drive.program.longfredVariants.${v.id}.title`)}
                </Typography>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      {selected && (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t("drive.program.enterPairingTitle")}
          </Typography>
          <NumberedSteps
            steps={Array.from({ length: selected.stepCount }, (_, i) => ({
              body: t(`drive.program.longfredVariants.${selected.id}.steps.${i + 1}`),
            }))}
          />
        </>
      )}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack}>
          {t("app.back")}
        </Button>
        <Button variant="contained" disabled={!canContinue} onClick={onContinue}>
          {t("drive.program.enterPairingContinue")}
        </Button>
      </Stack>
    </Box>
  );
}
