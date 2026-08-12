import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import ssh2 from 'ssh2';

const { Server: SshServer } = ssh2;

process.env.APP_PASSWORD = 'host-key-test-password';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'host-key-test-encryption-key-0123456789';
process.env.DATA_DIR = process.env.TEST_DATA_DIR ?? '/tmp/ssh-workbench-host-key-test';

const { encrypt } = await import('../dist-server/server/crypto.js');
const { discoverHostFingerprint, verifyTmuxSession } = await import('../dist-server/server/ssh.js');

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
  publicKeyEncoding: { format: 'pem', type: 'pkcs1' },
});

let authenticationAttempts = 0;
const sshServer = new SshServer({ hostKeys: [privateKey] }, (client) => {
  client.on('error', () => undefined);
  client.on('authentication', (context) => {
    authenticationAttempts += 1;
    context.reject();
  });
});

await new Promise((resolve, reject) => {
  sshServer.once('error', reject);
  sshServer.listen(0, '127.0.0.1', resolve);
});
const address = sshServer.address();
assert.equal(typeof address, 'object');

const source = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'host-key-discovery',
  host: '127.0.0.1',
  port: address.port,
  username: 'workbench',
  auth_type: 'password',
  credential: 'discovery-must-not-decrypt-this-credential',
  host_fingerprint: null,
  created_at: Date.now(),
  updated_at: Date.now(),
};

try {
  const fingerprint = await discoverHostFingerprint(source);
  assert.match(fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(authenticationAttempts, 0, 'fingerprint discovery sent SSH authentication data');

  await assert.rejects(
    verifyTmuxSession({
      ...source,
      credential: encrypt({ password: 'must-not-be-sent' }),
      host_fingerprint: `SHA256:${'A'.repeat(43)}`,
    }, 'sshwb_0123456789abcdef0123456789abcdef'),
    (error) => error?.code === 'HOST_KEY_MISMATCH',
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(authenticationAttempts, 0, 'host-key mismatch sent SSH authentication data');
  console.log('HOST KEY DISCOVERY PASSED: discovery and mismatch rejection occurred before authentication');
} finally {
  await new Promise((resolve) => sshServer.close(resolve));
}
