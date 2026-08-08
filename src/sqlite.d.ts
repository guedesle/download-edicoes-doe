declare module '@sqlite.org/sqlite-wasm' {
  const sqlite3InitModule: (options?: Record<string, unknown>) => Promise<any>;
  export default sqlite3InitModule;
}
