/** Worker entry: creates rooms and forwards WebSocket upgrades to the right Room object. */

import type { Env } from './env';
import { generateRoomCode, isValidRoomCode } from './room-code';

export { Room } from './room';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const MAX_CREATE_ATTEMPTS = 10;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

/** Picks an unused code: each candidate is claimed in its Room, and a taken one is retried. */
async function createRoom(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    if (await stub.create(code)) return Response.json({ code });
  }
  return Response.json({ error: 'Could not allocate a room code' }, { status: 503 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/rooms' && request.method === 'POST') {
      return withCors(await createRoom(env));
    }

    const match = /^\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (match && request.method === 'GET') {
      const code = (match[1] as string).toUpperCase();
      if (!isValidRoomCode(code)) return withCors(new Response('Room not found', { status: 404 }));
      const response = await env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
      // A 101 response carries the socket; rebuilding it would drop the socket.
      return response.status === 101 ? response : withCors(response);
    }

    return withCors(new Response('Not found', { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
