// The on-device build opens its database through sql.js (see ../backend.ts), never this.
export default class Unavailable {
  constructor() {
    throw new Error("better-sqlite3 is not available in the browser");
  }
}
