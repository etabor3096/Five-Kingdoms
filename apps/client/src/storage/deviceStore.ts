/** Native: AsyncStorage. (Web uses `deviceStore.web.ts`, which is plain localStorage.) */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from './keyValueStore';

export const deviceStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};
