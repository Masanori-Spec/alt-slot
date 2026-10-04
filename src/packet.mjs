import { LIMITS, fail } from "./limits.mjs";
import { encode } from "./zip.mjs";
export function validateData(value) {
  let nodes = 0;
  const seen = new Set();
  function visit(v, depth) {
    if (++nodes > LIMITS.packetNodes || depth > LIMITS.packetDepth)
      fail("packet-limit");
    if (v === null) return;
    if (typeof v === "string") {
      if (v.length > 32768 || /[\uD800-\uDFFF]/u.test(v)) fail("packet-string");
      return;
    }
    if (typeof v !== "object" || !v || seen.has(v)) fail("packet-data");
    seen.add(v);
    if (Array.isArray(v)) {
      if (
        Object.getPrototypeOf(v) !== Array.prototype ||
        Reflect.ownKeys(v).length !== v.length + 1
      )
        fail("packet-data");
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !d.enumerable || !Object.hasOwn(d, "value"))
          fail("packet-data");
        visit(d.value, depth + 1);
      }
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        fail("packet-data");
      for (const k of Reflect.ownKeys(v)) {
        if (
          typeof k !== "string" ||
          ["__proto__", "prototype", "constructor"].includes(k) ||
          k.length > 128
        )
          fail("packet-key");
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d.enumerable || !Object.hasOwn(d, "value")) fail("packet-data");
        visit(d.value, depth + 1);
      }
    }
    seen.delete(v);
  }
  visit(value, 0);
  if (encode(JSON.stringify(value)).length > LIMITS.packetBytes)
    fail("packet-limit");
  return value;
}
export function parsePacket(source) {
  if (typeof source !== "string" || encode(source).length > LIMITS.packetBytes)
    fail("packet-limit");
  let i = 0,
    nodes = 0;
  const ws = () => {
    while (/[ \t\r\n]/.test(source[i] ?? "!")) i++;
  };
  function str() {
    const start = i++;
    while (i < source.length) {
      if (source[i] === '"') {
        i++;
        try {
          return JSON.parse(source.slice(start, i));
        } catch {
          fail("packet-json");
        }
      }
      if (source[i] === "\\") i++;
      i++;
    }
    fail("packet-json");
  }
  function val(d) {
    if (d > LIMITS.packetDepth || ++nodes > LIMITS.packetNodes)
      fail("packet-limit");
    ws();
    if (source[i] === '"') return str();
    if (source.slice(i, i + 4) === "null") {
      i += 4;
      return null;
    }
    const open = source[i++];
    if (!["{", "["].includes(open)) fail("packet-json");
    const array = open === "[",
      close = array ? "]" : "}",
      out = array ? [] : Object.create(null);
    ws();
    if (source[i] === close) {
      i++;
      return out;
    }
    while (true) {
      ws();
      if (array) out.push(val(d + 1));
      else {
        if (source[i] !== '"') fail("packet-json");
        const k = str();
        if (Object.hasOwn(out, k)) fail("packet-duplicate-key");
        ws();
        if (source[i++] !== ":") fail("packet-json");
        out[k] = val(d + 1);
      }
      ws();
      const c = source[i++];
      if (c === close) return out;
      if (c !== ",") fail("packet-json");
    }
  }
  const out = val(0);
  ws();
  if (i !== source.length) fail("packet-json");
  return validateData(out);
}
export function exactKeys(v, keys) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join("\0") !== [...keys].sort().join("\0")
  )
    fail("packet-shape");
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function serializePacket(packet) {
  validateData(packet);
  const pretty = JSON.stringify(packet, null, 2);
  return encode(pretty).length <= LIMITS.packetBytes
    ? pretty
    : JSON.stringify(packet);
}
