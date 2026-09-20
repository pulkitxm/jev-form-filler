export const readerId = 'ofdidgkikbkkfnfflncfhhmejjigpoml';

export function createCredentialBridge({ runtime, storage, peerId = readerId, now = Date.now }) {
  const normalize = value => {
    const apiKey = typeof value?.apiKey === 'string' ? value.apiKey.trim() : null;
    const updatedAt = Number.isSafeInteger(value?.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0;
    if (apiKey && (apiKey.length > 512 || /\s/.test(apiKey))) throw new Error('Enter an API key without spaces.');
    return { apiKey: apiKey || null, updatedAt };
  };
  const read = async () => {
    const value = await storage.get(['apiKey', 'apiKeyUpdatedAt']);
    return normalize({ apiKey: value.apiKey, updatedAt: value.apiKeyUpdatedAt });
  };
  const write = async credential => {
    const value = normalize(credential);
    if (value.apiKey) await storage.set({ apiKey: value.apiKey, apiKeyUpdatedAt: value.updatedAt });
    else {
      await storage.remove('apiKey');
      await storage.set({ apiKeyUpdatedAt: value.updatedAt });
    }
    return value;
  };
  const send = async message => {
    try { return await runtime.sendMessage(peerId, message); }
    catch { return null; }
  };
  const publish = credential => send({ type: 'JEV_CREDENTIAL_UPDATE', credential });
  const save = async apiKey => {
    const local = await read();
    const credential = await write({ apiKey, updatedAt: Math.max(now(), local.updatedAt + 1) });
    const response = await publish(credential);
    return { ...credential, shared: Boolean(response?.credential) };
  };
  const remove = async () => {
    const local = await read();
    const credential = await write({ apiKey: null, updatedAt: Math.max(now(), local.updatedAt + 1) });
    const response = await publish(credential);
    return { ...credential, shared: Boolean(response?.credential) };
  };
  const accept = async incoming => {
    const remote = normalize(incoming);
    const local = await read();
    if (remote.updatedAt > local.updatedAt || (!local.apiKey && remote.apiKey && remote.updatedAt === local.updatedAt)) await write(remote);
    return read();
  };
  const sync = async () => {
    const response = await send({ type: 'JEV_CREDENTIAL_GET' });
    if (!response?.credential) return read();
    const remote = normalize(response.credential);
    let local = await read();
    if (remote.updatedAt > local.updatedAt || (!local.apiKey && remote.apiKey && remote.updatedAt === local.updatedAt)) local = await write(remote);
    else if (local.updatedAt > remote.updatedAt || (local.apiKey && !remote.apiKey)) await publish(local);
    return local;
  };
  const listen = () => runtime.onMessageExternal.addListener((message, sender, respond) => {
    if (sender.id !== peerId) return false;
    if (message?.type === 'JEV_CREDENTIAL_GET') {
      read().then(credential => respond({ credential }), () => respond({}));
      return true;
    }
    if (message?.type === 'JEV_CREDENTIAL_UPDATE') {
      accept(message.credential).then(credential => respond({ credential }), () => respond({}));
      return true;
    }
    return false;
  });
  return { read, save, remove, sync, listen };
}
