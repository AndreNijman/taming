// Stand-in for games-guard's NetLog entrypoint under `wrangler dev`: each lag
// record goes to the log as one "NETLOG_RECORD {json}" line for rooms.test.mjs.
import { WorkerEntrypoint } from 'cloudflare:workers';

export class NetLog extends WorkerEntrypoint {
  async record(game, record) {
    console.log(`NETLOG_RECORD ${JSON.stringify({ game, record })}`);
    return { ok: true };
  }
}

export default { fetch: () => new Response('netlog stub') };
