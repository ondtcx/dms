export const AUDIT_REQUEST_ID_HEADER = 'x-request-id';

export const REDACTED = '[REDACTED]';

// Keys whose value must never be persisted in the audit trail.
export const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'resettoken',
  'secret',
  'clientsecret',
  'totpsecret',
  'totppendingsecret',
  'totprecoverycodehashes',
  'recoverycode',
  'authorization',
  'cookie',
  'setcookie',
  'apikey',
  'api_key',
  'privatekey',
]);
