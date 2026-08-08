import { createTheme } from "@mui/material/styles";

// Kiosk sizing: every interactive target is at least 64px tall so the
// tablet is usable with gloves and by kids standing at the layout.
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1f6feb" },
    secondary: { main: "#c2410c" },
    background: { default: "#f1f5f9", paper: "#ffffff" },
  },
  typography: {
    fontFamily: "Roboto, system-ui, sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    button: { fontSize: "1.1rem", fontWeight: 600, textTransform: "none" },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiButton: {
      defaultProps: { size: "large", disableElevation: true },
      styleOverrides: {
        root: { minHeight: 64, paddingInline: 28 },
      },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, size: "medium" },
    },
    MuiInputBase: {
      styleOverrides: { input: { fontSize: "1.4rem", paddingBlock: 18 } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { minHeight: 64 } },
    },
  },
});

export default theme;
