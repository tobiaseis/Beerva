const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const compilerOptions = {
  esModuleInterop: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const compile = (source, filename) => ts.transpileModule(source, {
  compilerOptions,
  fileName: filename,
}).outputText;

// Lets a loaded module require its own relative TypeScript imports, so helpers
// can live in whichever module owns them instead of being inlined per file.
if (!Module._extensions['.ts']) {
  Module._extensions['.ts'] = (loadedModule, filename) => {
    loadedModule._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
  };
}

if (!Module._extensions['.tsx']) {
  Module._extensions['.tsx'] = Module._extensions['.ts'];
}

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(root, relativePath);
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(compile(fs.readFileSync(filename, 'utf8'), filename), filename);
  return compiledModule.exports;
};

module.exports = { loadTypeScriptModule };
