export const VERSION = "0.1.0";
export const LIMITS = Object.freeze({
  inputBytes: 25 * 1024 * 1024,
  outputBytes: 25 * 1024 * 1024,
  entryBytes: 30 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  entries: 2500,
  ratio: 200,
  xmlBytes: 4 * 1024 * 1024,
  xmlBytesTotal: 20 * 1024 * 1024,
  xmlNodes: 100000,
  xmlNodesTotal: 250000,
  xmlDepth: 80,
  xmlNameChars: 128,
  xmlAttributes: 128,
  namespaceBindings: 128,
  namespaceUriChars: 512,
  namespaceWorkUnits: 4 * 1024 * 1024,
  namespaceWorkUnitsTotal: 20 * 1024 * 1024,
  occurrences: 300,
  relationships: 5000,
  idChars: 128,
  pathChars: 512,
  descriptionBytes: 4096,
  packetBytes: 4 * 1024 * 1024,
  packetNodes: 30000,
  packetDepth: 12,
  previewBytes: 2 * 1024 * 1024,
});
export class InputError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "InputError";
    this.code = code;
  }
}
export const fail = (code, detail) => {
  throw new InputError(code, detail);
};
