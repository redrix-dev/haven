import { createContext, useContext, type ReactNode } from "react";

type PasswordRecoveryGateValue = {
  clearPasswordRecoveryGate: () => void;
};

const PasswordRecoveryGateContext = createContext<PasswordRecoveryGateValue | null>(null);

export function PasswordRecoveryGateProvider({
  children,
  clearPasswordRecoveryGate,
}: {
  children: ReactNode;
  clearPasswordRecoveryGate: () => void;
}) {
  return (
    <PasswordRecoveryGateContext.Provider value={{ clearPasswordRecoveryGate }}>
      {children}
    </PasswordRecoveryGateContext.Provider>
  );
}

export function usePasswordRecoveryGate(): PasswordRecoveryGateValue | null {
  return useContext(PasswordRecoveryGateContext);
}
