import { isIP } from 'node:net';
import { z } from 'zod';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(80);
const hostname = z.string().trim().min(1).max(253).refine((value) => {
  if (isIP(value)) return true;
  if (value === 'localhost') return true;
  if (value.endsWith('.') || value.includes('..')) return false;
  return value.split('.').every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  ));
}, 'Invalid host name or IP address');
const username = z.string().trim().min(1).max(128).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const password = z.string().max(16_384);
const privateKey = z.string().max(1_048_576);
const passphrase = z.string().max(16_384);

export const loginSchema = z.object({
  password: z.string().min(1).max(16_384),
}).strict();

export const createSourceSchema = z.object({
  name,
  host: hostname,
  port: z.number().int().min(1).max(65_535),
  username,
  authType: z.enum(['password', 'privateKey']),
  password: password.optional(),
  privateKey: privateKey.optional(),
  passphrase: passphrase.optional(),
}).strict().superRefine((value, context) => {
  if (value.authType === 'password' && !value.password) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password is required' });
  }
  if (value.authType === 'privateKey' && !value.privateKey?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['privateKey'], message: 'Private key is required' });
  }
});

export const updateSourceSchema = z.object({
  name: name.optional(),
  host: hostname.optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  username: username.optional(),
  authType: z.enum(['password', 'privateKey']).optional(),
  password: password.optional(),
  privateKey: privateKey.optional(),
  passphrase: passphrase.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const trustFingerprintSchema = z.object({
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
}).strict();

export const createSessionSchema = z.object({
  sourceId: uuid,
  title: z.string().trim().min(1).max(80).optional(),
  cols: z.number().int().min(2).max(500).default(100),
  rows: z.number().int().min(2).max(300).default(30),
}).strict();

export const idParameterSchema = z.object({ id: uuid }).strict();

export const websocketClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(65_536) }).strict(),
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(300),
  }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
