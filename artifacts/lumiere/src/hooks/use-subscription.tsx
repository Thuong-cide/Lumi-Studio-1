import { createContext, useContext } from "react";

type SubscriptionContextType = {
  openPaymentModal: () => void;
};

export const SubscriptionContext = createContext<SubscriptionContextType>({
  openPaymentModal: () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}
