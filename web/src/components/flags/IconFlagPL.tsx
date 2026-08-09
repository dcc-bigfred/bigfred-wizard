import type { SvgIconProps } from "@mui/material/SvgIcon";
import SvgIcon from "@mui/material/SvgIcon";

/**
 * Poland flag in the same style as [material-ui-flags](https://github.com/ekiziltas/material-ui-flags)
 * (SVG from lipis/flag-icon-css 4x3). That package has no IconFlagPL.
 */
export default function IconFlagPL(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 640 480" {...props}>
      <path fill="#fff" d="M0 0h640v240H0z" />
      <path fill="#dc143c" d="M0 240h640v240H0z" />
    </SvgIcon>
  );
}
