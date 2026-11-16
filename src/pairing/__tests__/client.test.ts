import { CandidateClient } from '../client';
import { candidateUrl, pairingEnabled } from '../config';
const url = 'https://website.example.test/api/telegram/connection/candidate';
const candidate = {
  attempt: 'dmn1_' + Buffer.alloc(32, 1).toString('base64url'),
  userId: '123',
  username: 'example_user',
  codeHash: 'a'.repeat(64),
};
const grant = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '123',
  generation: '0',
};
describe('pairing configuration', () => {
  it('requires both explicit switches and a fixed credential-free HTTPS callback', () => {
    const before = { ...process.env };
    try {
      delete process.env.WEBSITE_PAIRING_ENABLED;
      delete process.env.WEBSITE_DELIVERY_ENABLED;
      expect(pairingEnabled()).toBe(false);
      process.env.WEBSITE_PAIRING_ENABLED = 'true';
      expect(pairingEnabled()).toBe(false);
      process.env.WEBSITE_DELIVERY_ENABLED = 'true';
      expect(pairingEnabled()).toBe(true);
    } finally {
      process.env = before;
    }
    expect(candidateUrl(url)).toBe(url);
    for (const value of [
      undefined,
      'broken',
      url.replace('https', 'http'),
      url + '#fragment',
      url + '?x=1',
      url + '/',
      url.replace('website', 'user:secret@website'),
      url.replace('candidate', 'other'),
    ])
      expect(() => candidateUrl(value)).toThrow();
  });
});
describe('authenticated candidate callbacks', () => {
  const original = global.fetch;
  const fetchMock = jest.fn();
  const client = new CandidateClient(url, 'service-secret', '999');
  const expiry = () => new Date(Date.now() + 300000).toISOString();
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterAll(() => {
    global.fetch = original;
  });
  const respond = (body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
  it('reserves then binds only exact versioned responses, without exposing a plaintext code', async () => {
    const expiresAt = expiry(),
      createdAt = new Date().toISOString();
    respond({ version: 1, createdAt, expiresAt });
    expect(await client.reserve(candidate)).toEqual({
      createdAt: new Date(createdAt),
      expiresAt: new Date(expiresAt),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: {
          authorization: 'Bearer service-secret',
          'content-type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      version: 1,
      botId: '999',
      phase: 'reserve',
      ...candidate,
    });
    respond({ version: 1, registered: true });
    await client.bind(candidate, grant);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      version: 1,
      botId: '999',
      phase: 'bind',
      ...candidate,
      consent: grant,
    });
  });
  it('accepts a ten-minute attempt with the website clock twenty seconds ahead', async () => {
    const now = Date.now();
    const createdAt = new Date(now + 20000).toISOString(),
      expiresAt = new Date(now + 620000).toISOString();
    respond({ version: 1, createdAt, expiresAt });
    await expect(client.reserve(candidate)).resolves.toEqual({
      createdAt: new Date(createdAt),
      expiresAt: new Date(expiresAt),
    });
  });
  it('rejects malformed, extended and inconsistent attempt timestamps', async () => {
    const now = Date.now(),
      stamp = (offset: number) => new Date(now + offset).toISOString();
    const good = { version: 1, createdAt: stamp(0), expiresAt: stamp(300000) };
    for (const body of [
      {},
      { ...good, version: 2 },
      { ...good, extra: true },
      { ...good, expiresAt: 1 },
      { ...good, createdAt: 1 },
      { ...good, createdAt: 'bad' },
      { ...good, createdAt: stamp(0).replace('.000Z', 'Z') + 'bad' },
      { ...good, createdAt: stamp(0).replace(/\.[0-9]{3}Z$/, 'Z') },
      { ...good, createdAt: stamp(60000) },
      { ...good, expiresAt: stamp(-1000) },
      { ...good, expiresAt: stamp(700000) },
      { ...good, createdAt: stamp(-200000), expiresAt: stamp(-1000) },
      { ...good, createdAt: stamp(-400000) },
      { ...good, expiresAt: 'bad' },
      { ...good, expiresAt: stamp(300000).replace(/\.[0-9]{3}Z$/, 'Z') },
    ]) {
      respond(body);
      await expect(client.reserve(candidate)).rejects.toThrow(
        'invalid-pairing-response',
      );
    }
  });
  it.each([
    {},
    { version: 2, registered: true },
    { version: 1, registered: false },
    { version: 1, registered: true, extra: true },
  ])('rejects incomplete binding: %j', async (body) => {
    respond(body);
    await expect(client.bind(candidate, grant)).rejects.toThrow(
      'invalid-pairing-response',
    );
  });
  it('bounds response bytes and redacts transport, JSON and stream failures', async () => {
    for (const response of [
      new Response('private', { status: 503 }),
      new Response(null, { status: 204 }),
      new Response('{secret'),
      new Response('null'),
      new Response('[]'),
      new Response('"secret"'),
      new Response('x'.repeat(4097)),
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('secret'));
          },
        }),
      ),
    ]) {
      fetchMock.mockResolvedValue(response);
      await expect(client.reserve(candidate)).rejects.toThrow(
        'pairing-callback-unavailable',
      );
    }
    fetchMock.mockRejectedValue(new Error('secret in URL'));
    await expect(client.reserve(candidate)).rejects.toThrow(
      'pairing-callback-unavailable',
    );
  });
});
