import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import { keyframes } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import conductorUrl from "../assets/conductor.webp";
import { useHelp } from "./HelpContext";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const popIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

/** Full-screen conductor help bubble; content comes from HelpContext. */
export default function HelpOverlay() {
  const { t } = useTranslation();
  const { content, hideHelp } = useHelp();

  useEffect(() => {
    if (content == null) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, hideHelp]);

  if (content == null) {
    return null;
  }

  return (
    <Box
      role="dialog"
      aria-modal="true"
      onClick={hideHelp}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        bgcolor: "rgba(15, 23, 42, 0.45)",
        animation: `${fadeIn} 0.2s ease-out both`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          right: { xs: -12, sm: 0, md: 8 },
          bottom: 0,
          width: { xs: 180, sm: 240, md: 300 },
          zIndex: 1,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <Box
          component="img"
          src={conductorUrl}
          alt=""
          draggable={false}
          sx={{
            display: "block",
            width: "100%",
            height: "auto",
            filter: "drop-shadow(0 12px 28px rgba(15, 39, 68, 0.35))",
          }}
        />
      </Box>

      <Paper
        elevation={8}
        onClick={(e) => e.stopPropagation()}
        sx={(theme) => ({
          position: "absolute",
          zIndex: 2,
          left: { xs: 16, sm: 24, md: "auto" },
          right: { xs: 16, sm: 280, md: 340 },
          bottom: { xs: 200, sm: 120, md: 140 },
          maxWidth: { xs: "calc(100% - 32px)", sm: 420 },
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          bgcolor: theme.palette.background.paper,
          animation: `${popIn} 0.25s ease-out both`,
          // Speech-tail: solid CSS triangle (theme tokens in borderColor break
          // and render as a black box next to OK).
          "&::after": {
            content: '""',
            position: "absolute",
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderColor: "transparent",
            // Mobile: point down toward the conductor
            right: 48,
            bottom: -12,
            borderWidth: "14px 12px 0 12px",
            borderTopColor: theme.palette.background.paper,
            [theme.breakpoints.up("sm")]: {
              // Desktop: point right toward the conductor
              right: -14,
              bottom: 36,
              borderWidth: "12px 0 12px 16px",
              borderTopColor: "transparent",
              borderLeftColor: theme.palette.background.paper,
            },
          },
        })}
      >
        <Box
          sx={{
            typography: "body1",
            fontSize: "1.15rem",
            lineHeight: 1.5,
            mb: 2.5,
            "& ol": { m: 0, pl: 2.5 },
            "& li": { mb: 1 },
          }}
        >
          {content}
        </Box>
        <Button variant="contained" fullWidth onClick={hideHelp}>
          {t("help.ok")}
        </Button>
      </Paper>
    </Box>
  );
}
