export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

export function requireValue(condition, message) {
  if (!condition) throw new InputError(message);
}

export function object(value, label) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  return value;
}

export function array(value, label) {
  requireValue(Array.isArray(value), `${label}: expected array`);
  return value;
}

export function text(value, label) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value), `${label}: expected single-line text (1..200 characters)`);
  return value;
}

export function id(value, label) {
  text(value, label);
  requireValue(/^demo-[a-z0-9-]+$/.test(value), `${label}: expected made-up demo-* ID`);
  return value;
}

export function integer(value, label, minimum = 0) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= 1_000_000_000, `${label}: expected integer ${minimum}..1000000000`);
  return value;
}

export function date(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label}: expected YYYY-MM-DD`);
  const time = Date.parse(`${value}T00:00:00Z`);
  requireValue(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value, `${label}: invalid calendar date`);
  return value;
}

export function timestamp(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value), `${label}: expected UTC timestamp`);
  const time = Date.parse(value);
  requireValue(Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, '.000Z').replace(/(\.\d{3})\.000Z$/, '$1Z'), `${label}: invalid timestamp`);
  return value;
}

export function unique(values, key, label) {
  requireValue(new Set(values.map(value => value[key])).size === values.length, `${label}: duplicate ${key}`);
}

export function email(value, label) {
  text(value, label);
  requireValue(/^[a-z0-9._+-]+@[a-z0-9-]+\.example$/.test(value), `${label}: synthetic .example email required`);
  return value;
}
