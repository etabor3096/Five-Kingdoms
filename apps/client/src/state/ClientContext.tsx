import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { GameClient } from '../net/GameClient';
import { ClientStore, type ClientSnapshot } from './clientStore';

const StoreContext = createContext<ClientStore | null>(null);

/** Provides a `GameClient` (and the store that tracks it) to the whole UI. */
export function ClientProvider({
  createClient,
  children,
}: {
  createClient: () => GameClient;
  children: ReactNode;
}) {
  const [store] = useState(() => new ClientStore(createClient()));
  useEffect(() => () => store.dispose(), [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The store, for calling `store.client` methods and `openStandings`. */
export function useStore(): ClientStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <ClientProvider>');
  return store;
}

/** The latest snapshot; re-renders when it changes. */
export function useSnapshot(): ClientSnapshot {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
