import test from 'node:test';
import assert from 'node:assert/strict';
import { Composer } from '../src/server/composer.mjs';
function mock() {
  const c = new Composer('/tmp');
  c.connect = async () => {};
  c.rpc = async () => ({ account: { type: 'chatgpt' } });
  c.credentialStamp = () => 'same';
  c.restarts = 0;
  c.restart = async () => {
    c.restarts++;
  };
  return c;
}
test('stale authentication reconnects once then returns fresh notes', async () => {
  const c = mock();
  let calls = 0;
  const events = [];
  c.composeOnce = async (_, emit) => {
    if (!calls++) throw Error('Your access token could not be refreshed');
    emit({ type: 'note' });
  };
  await c.compose({}, (e) => events.push(e), new AbortController().signal);
  assert.equal(c.restarts, 1);
  assert.equal(calls, 2);
  assert.equal(events.filter((e) => e.type === 'note').length, 1);
});
test('persistent auth failure stops after one retry', async () => {
  const c = mock();
  c.composeOnce = async () => {
    throw Error('access token expired');
  };
  await assert.rejects(c.compose({}, () => {}, new AbortController().signal));
  assert.equal(c.restarts, 1);
});
test('never retries after notes delivered or for non-auth failures', async () => {
  for (const partial of [true, false]) {
    const c = mock();
    c.composeOnce = async (_, emit) => {
      if (partial) emit({ type: 'note' });
      throw Error(partial ? 'access token expired' : 'rate limit');
    };
    await assert.rejects(c.compose({}, () => {}, new AbortController().signal));
    assert.equal(c.restarts, 0);
  }
});
test('credential metadata change reloads before generation', async () => {
  const c = mock();
  c.authStamp = 'old';
  c.composeOnce = async () => {};
  await c.compose({}, () => {}, new AbortController().signal);
  assert.equal(c.restarts, 1);
});
