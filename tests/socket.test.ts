/**
 * Who a socket message is accepted from, and who it is sent to.
 *
 * Both messages take over someone else's screen or spend their bandwidth, so
 * the receiver decides, and it decides on the sender id Foundry's server
 * appends to every relayed message. That id comes from the authenticated
 * session. Anything inside the payload was chosen by whoever built it.
 */
import { withMockFoundry } from '@vttforge/testing/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetched: string[] = [];
const opened: unknown[] = [];
const turned: number[] = [];

vi.mock('../scripts/cache.js', () => ({
  fetchPdf: (url: string) => {
    fetched.push(url);
    return Promise.resolve(new Uint8Array());
  },
}));

// The real wrapper refuses a `get` before `register`, which is its job, and
// not the thing under test here.
vi.mock('../scripts/settings.js', () => ({
  cacheBudget: () => 1024,
  reuseViewer: () => true,
}));

vi.mock('../scripts/apps/pdf-viewer.js', () => ({
  PdfViewer: class {
    url: string;
    constructor(options: { url: string }) {
      this.url = options.url;
      opened.push(options);
    }
    goToPage(page: number) {
      turned.push(page);
    }
    render() {
      return Promise.resolve(this);
    }
  },
}));

const USERS: Record<string, { isGM: boolean }> = {
  gm: { isGM: true },
  player: { isGM: false },
};

let restore: () => void;
/** What the channel handler was registered as, so tests can drive it. */
let receive: (message: unknown, senderId?: string) => void;
const emitted: Array<{ message: unknown; options?: unknown }> = [];

beforeEach(() => {
  fetched.length = 0;
  opened.length = 0;
  turned.length = 0;
  emitted.length = 0;
  restore = withMockFoundry({
    game: {
      userId: 'gm',
      user: { isGM: true },
      users: { get: (id: string) => USERS[id] },
      socket: {
        on: (_channel: string, fn: typeof receive) => {
          receive = fn;
        },
        emit: (_channel: string, message: unknown, options?: unknown) => {
          emitted.push({ message, options });
        },
      },
    },
    foundry: { applications: { instances: new Map() } },
  }).restore;
});

afterEach(() => {
  restore();
  vi.resetModules();
});

async function listen() {
  const socket = await import('../scripts/socket.js');
  socket.registerSocket();
  return socket;
}

describe('receiving', () => {
  const setView = { type: 'setView', url: 'pdfs/phb.pdf', title: 'PHB', page: 3 };

  it('acts on a message the server says came from a GM', async () => {
    await listen();
    receive(setView, 'gm');
    expect(opened).toHaveLength(1);
  });

  it('drops a message the server says came from a player', async () => {
    await listen();
    receive(setView, 'player');
    expect(opened).toEqual([]);
  });

  it('drops a message with no sender id at all', async () => {
    await listen();
    receive(setView);
    expect(opened).toEqual([]);
  });

  it('drops a message naming a user who is not in the world', async () => {
    await listen();
    receive(setView, 'nobody');
    expect(opened).toEqual([]);
  });

  it('ignores a sender id written into the payload', async () => {
    await listen();
    // The only id that counts is the second argument. A payload naming the GM
    // proves nothing: whoever built the payload chose what went in it.
    receive({ ...setView, senderId: 'gm', userIds: null }, 'player');
    expect(opened).toEqual([]);
  });

  it('gates preload the same way, since it spends the receiver\'s bandwidth', async () => {
    await listen();
    receive({ type: 'preload', url: 'pdfs/phb.pdf' }, 'player');
    expect(fetched).toEqual([]);
    receive({ type: 'preload', url: 'pdfs/phb.pdf' }, 'gm');
    expect(fetched).toEqual(['pdfs/phb.pdf']);
  });
});

describe('sending', () => {
  it('broadcasts with no recipients when nobody is named', async () => {
    const { shareView } = await listen();
    shareView({ url: 'pdfs/phb.pdf', title: 'PHB', page: 3 }, null);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.options).toBeUndefined();
    // A broadcast excludes the sender, so this client acts locally.
    expect(opened).toHaveLength(1);
  });

  it('lets the server route to named users instead of every client filtering', async () => {
    const { shareView } = await listen();
    shareView({ url: 'pdfs/phb.pdf', title: 'PHB', page: 3 }, ['player']);
    expect(emitted[0]?.options).toEqual({ recipients: ['player'] });
  });

  it('does not open the page twice for a GM who names themselves', async () => {
    const { shareView } = await listen();
    shareView({ url: 'pdfs/phb.pdf', title: 'PHB', page: 3 }, ['gm', 'player']);
    // A routed send is not excluded from its own sender, so our own id is
    // stripped and the local call below is the only one that acts here.
    expect(emitted[0]?.options).toEqual({ recipients: ['player'] });
    expect(opened).toHaveLength(1);
  });

  it('emits nothing when the only named user is ourselves', async () => {
    const { shareView } = await listen();
    shareView({ url: 'pdfs/phb.pdf', title: 'PHB', page: 3 }, ['gm']);
    expect(emitted).toEqual([]);
    expect(opened).toHaveLength(1);
  });
});
