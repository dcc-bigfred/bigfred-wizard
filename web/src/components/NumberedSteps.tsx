import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface NumberedStep {
  body: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
}

interface Props {
  steps: NumberedStep[];
}

/** Large step number on the left, concrete action (+ optional image) on the right. */
export default function NumberedSteps({ steps }: Props) {
  return (
    <Stack spacing={2.5} component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {steps.map((step, i) => (
        <Box
          key={i}
          component="li"
          sx={{
            display: "grid",
            gridTemplateColumns: "72px 1fr",
            gap: 2,
            alignItems: "center",
          }}
        >
          <Typography
            aria-hidden
            sx={{
              fontSize: { xs: "2.5rem", sm: "3.25rem" },
              fontWeight: 800,
              lineHeight: 1,
              color: "primary.main",
              textAlign: "center",
            }}
          >
            {i + 1}
          </Typography>
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
              {step.body}
            </Typography>
            {step.imageSrc && (
              <Box
                component="img"
                src={step.imageSrc}
                alt={step.imageAlt ?? ""}
                sx={{
                  mt: 1.5,
                  maxHeight: 120,
                  maxWidth: "100%",
                  objectFit: "contain",
                  borderRadius: 1,
                }}
              />
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
