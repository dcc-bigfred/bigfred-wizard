import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface HelpValue {
  content: ReactNode | null;
  showHelp: (content: ReactNode) => void;
  hideHelp: () => void;
}

const HelpContext = createContext<HelpValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null);

  const showHelp = useCallback((next: ReactNode) => {
    setContent(next);
  }, []);

  const hideHelp = useCallback(() => {
    setContent(null);
  }, []);

  const value = useMemo(
    () => ({ content, showHelp, hideHelp }),
    [content, showHelp, hideHelp],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpValue {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error("useHelp must be used inside <HelpProvider>");
  }
  return ctx;
}
