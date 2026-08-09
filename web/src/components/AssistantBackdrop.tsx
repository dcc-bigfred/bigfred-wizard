import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";

import conductorUrl from "../assets/conductor.webp";

const peekIn = keyframes`
  from {
    opacity: 0;
    transform: translate(14%, 10%);
  }
  to {
    opacity: 1;
    transform: translate(0, 0);
  }
`;

const softBob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
`;

/** Decorative railway conductor peeking from the bottom-right corner. */
export default function AssistantBackdrop() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        right: { xs: -20, sm: -8, md: 0 },
        bottom: { xs: -4, sm: 0, md: 4 },
        width: { xs: 150, sm: 200, md: 260 },
        zIndex: 0,
        pointerEvents: "none",
        userSelect: "none",
        opacity: { xs: 0.4, sm: 0.48, md: 0.55 },
        animation: `${peekIn} 0.9s ease-out both`,
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
          filter: "drop-shadow(0 10px 20px rgba(15, 39, 68, 0.2))",
          animation: `${softBob} 7s ease-in-out 1s infinite`,
        }}
      />
    </Box>
  );
}
