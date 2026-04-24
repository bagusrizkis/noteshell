import * as vscode from "vscode";

// Cache: computed once per session; refreshed on extension change.
let cachedUserLangs: Set<string> | undefined;

function computeUserInstalledLanguages(): Set<string> {
  const langs = new Set<string>();
  for (const ext of vscode.extensions.all) {
    // Heuristics for "built-in": ID prefix or install path under VSCode's app resources.
    if (ext.id.startsWith("vscode.")) continue;
    if (ext.extensionPath.includes("/resources/app/extensions/")) continue;
    if (ext.extensionPath.includes("\\resources\\app\\extensions\\")) continue;

    const contributed = ext.packageJSON?.contributes?.languages as
      | Array<{ id?: string }>
      | undefined;
    if (!Array.isArray(contributed)) continue;
    for (const lang of contributed) {
      if (typeof lang?.id === "string") langs.add(lang.id);
    }
  }
  return langs;
}

export function getUserInstalledLanguages(): Set<string> {
  if (!cachedUserLangs) cachedUserLangs = computeUserInstalledLanguages();
  return cachedUserLangs;
}

export function onExtensionsChanged(): vscode.Disposable {
  return vscode.extensions.onDidChange(() => {
    cachedUserLangs = undefined;
  });
}
