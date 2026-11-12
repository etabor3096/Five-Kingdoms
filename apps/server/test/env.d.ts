import type { Room } from '../src/room';

declare global {
  namespace Cloudflare {
    interface Env {
      ROOM: DurableObjectNamespace<Room>;
    }
  }
}
