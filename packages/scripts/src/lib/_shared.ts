import globPkg from 'glob';

const globSync = globPkg.sync;

export function collectFilePaths(globs: Array<string>, cwd: string): Array<string> {
  return globs.flatMap((glob) => globSync(glob, { cwd, absolute: true }));
}
