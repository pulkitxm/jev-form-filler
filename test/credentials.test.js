import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialBridge } from '../extension/credentials.js';

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    async get(keys) { return Object.fromEntries(keys.filter(key => key in values).map(key => [key, values[key]])); },
    async set(update) { Object.assign(values, update); },
    async remove(key) { delete values[key]; }
  };
}

test('saves and removes a credential locally and publishes it to the Jev peer', async () => {
  const messages = [];
  const storage = memoryStorage();
  const bridge = createCredentialBridge({ runtime: { sendMessage: async (id, message) => messages.push({ id, message }), onMessageExternal: { addListener() {} } }, storage, peerId: 'peer', now: () => 42 });
  await bridge.save('synthetic-key');
  assert.deepEqual(storage.values, { apiKey: 'synthetic-key', apiKeyUpdatedAt: 42 });
  assert.deepEqual(messages[0], { id: 'peer', message: { type: 'JEV_CREDENTIAL_UPDATE', credential: { apiKey: 'synthetic-key', updatedAt: 42 } } });
  await bridge.remove();
  assert.deepEqual(storage.values, { apiKeyUpdatedAt: 43 });
  assert.equal(messages[1].message.credential.apiKey, null);
});

test('sync imports a newer peer credential and keeps a newer local credential', async () => {
  const storage = memoryStorage();
  let remote = { apiKey: 'peer-key', updatedAt: 10 };
  const sent = [];
  const runtime = { sendMessage: async (id, message) => {
    sent.push(message);
    if (message.type === 'JEV_CREDENTIAL_GET') return { credential: remote };
    return {};
  }, onMessageExternal: { addListener() {} } };
  const bridge = createCredentialBridge({ runtime, storage, peerId: 'peer' });
  assert.deepEqual(await bridge.sync(), remote);
  await storage.set({ apiKey: 'local-key', apiKeyUpdatedAt: 20 });
  remote = { apiKey: 'old-peer-key', updatedAt: 15 };
  assert.deepEqual(await bridge.sync(), { apiKey: 'local-key', updatedAt: 20 });
  assert.equal(sent.at(-1).credential.apiKey, 'local-key');
});

test('external messages are restricted to the configured Jev peer', async () => {
  const storage = memoryStorage({ apiKey: 'local-key', apiKeyUpdatedAt: 5 });
  let listener;
  const runtime = { sendMessage: async () => null, onMessageExternal: { addListener(value) { listener = value; } } };
  const bridge = createCredentialBridge({ runtime, storage, peerId: 'peer' });
  bridge.listen();
  assert.equal(listener({ type: 'JEV_CREDENTIAL_GET' }, { id: 'stranger' }, () => {}), false);
  const response = await new Promise(resolve => listener({ type: 'JEV_CREDENTIAL_GET' }, { id: 'peer' }, resolve));
  assert.deepEqual(response.credential, { apiKey: 'local-key', updatedAt: 5 });
});
