declare module "better-sqlite3" {
  interface Options {
    readonly memory?: boolean;
    readonly fileMustExist?: boolean;
    readonly verbose?: (msg: string) => void;
  }

  class Database {
    constructor(filename: string, options?: Options);
    prepare(sql: string): any;
    exec(sql: string): void;
    close(): void;
  }

  const BetterSqlite3: {
    new (filename: string, options?: Options): Database;
  };

  export = BetterSqlite3;
}
