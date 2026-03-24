import { invoke } from "@tauri-apps/api/core";

/** Wrappers around Tauri Rust commands */

export const tauriFs = {
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, content: string) =>
    invoke<void>("write_file", { path, content }),
  listFiles: (root: string) =>
    invoke<string[]>("list_files_recursive", { root }),
};

export const tauriGit = {
  run: (args: string[], cwd: string) =>
    invoke<string>("run_git", { args, cwd }),
};

export const tauriKeychain = {
  store: (token: string) => invoke<void>("store_token", { token }),
  get: () => invoke<string | null>("get_token"),
  delete: () => invoke<void>("delete_token"),
};
