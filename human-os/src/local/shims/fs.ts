// Browser stand-in for node:fs (the on-device build never touches a filesystem).
export const mkdirSync = () => undefined;
export const existsSync = () => false;
export const readFileSync = () => "";
export default { mkdirSync, existsSync, readFileSync };
