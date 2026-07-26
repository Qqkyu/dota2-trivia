import PusherClient from "pusher-js";

let client: PusherClient | null | undefined;

export function getPusherClient() {
  if (client !== undefined) return client;

  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    client = null;
    return client;
  }

  client = new PusherClient(key, {
    cluster,
  });

  return client;
}
