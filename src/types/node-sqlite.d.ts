// Minimal ambient types for Node's built-in `node:sqlite` module (still
// experimental as of Node 22, so @types/node doesn't ship it yet). Only
// covers what src/lib/db.ts actually calls.
declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
