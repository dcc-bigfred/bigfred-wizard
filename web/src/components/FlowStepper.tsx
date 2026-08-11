import type { ReactNode } from "react";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";

interface Props {
  activeStep: number;
  labels: readonly ReactNode[];
}

/**
 * Horizontal flow progress that wraps onto extra rows when labels don't fit
 * a single line (phones / many steps). Connectors stay short so wrap looks
 * intentional rather than a broken single-row stepper.
 */
export default function FlowStepper({ activeStep, labels }: Props) {
  return (
    <Stepper
      activeStep={activeStep}
      alternativeLabel
      sx={{
        mb: 4,
        width: "100%",
        maxWidth: "100%",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "flex-start",
        rowGap: 1.5,
        columnGap: 0,
        "& .MuiStep-root": {
          flex: "1 1 4.5rem",
          minWidth: "4.5rem",
          maxWidth: "7.5rem",
          paddingInline: 0.5,
        },
        "& .MuiStepConnector-root": {
          flex: "0 0 0.75rem",
          minWidth: "0.5rem",
          maxWidth: "1.25rem",
          top: 12,
        },
        "& .MuiStepConnector-line": {
          minHeight: 0,
          borderTopWidth: 2,
        },
        "& .MuiStepLabel-label": {
          mt: 0.75,
          whiteSpace: "normal",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          fontSize: { xs: "0.7rem", sm: "0.8rem" },
          lineHeight: 1.25,
        },
      }}
    >
      {labels.map((label, i) => (
        <Step key={i}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}
