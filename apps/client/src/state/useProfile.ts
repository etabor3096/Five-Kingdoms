import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../net/GameClient';
import { deviceStore } from '../storage/deviceStore';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../storage/profile';

/** The device-persisted name and avatar. `loaded` flips once storage has been read. */
export function useProfile(): {
  profile: Profile;
  loaded: boolean;
  update: (patch: Partial<Profile>) => void;
} {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadProfile(deviceStore).then((p) => {
      if (!alive) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      void saveProfile(deviceStore, next);
      return next;
    });
  }, []);

  return { profile, loaded, update };
}
