import { relative, resolve, join } from 'node:path';
//import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import yargs from 'yargs';
import ora from 'ora';
import { AST } from '@codemod-utils/ast-javascript';

import { collectFilePaths } from './_shared.js';

export async function syncTemplateRegistry(
  args: Array<string>,
  { cwd = '/Users/phndiaye/code/@upfluence/oss-components', spinner = ora() } = {} // process.cwd()
): Promise<void> {
  let { globs, 'registry-file': registryFile, check } = parseArgs(args);

  spinner.start('Checking type-safe components/helpers/modifiers...');

  let typesafeItems = new Map<string, { name: string; type: string }[]>();

  for (let filePath of collectFilePaths(globs, cwd)) {
    spinner.text = `Checking ${relative(cwd, filePath)}...`;

    let fileContents = await readFile(filePath, 'utf-8');
    let registryMembers = findGlintRegistryMembers(fileContents);
    if (registryMembers.length > 0) {
      typesafeItems.set(filePath, registryMembers);
    }
  }

  if (check) {
    //spinner.text = 'Creating template registry file...';
    return;
  }

  let registryFileContents;
  let shouldCreateRegistryFile = false;
  try {
    registryFileContents = await readFile(join(cwd, registryFile));
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      throw e;
    }

    shouldCreateRegistryFile = true;
  }

  if (shouldCreateRegistryFile) {
    spinner.text = 'Creating template registry file...';
  }

  await updateTemplateRegistry(cwd, registryFile, typesafeItems, shouldCreateRegistryFile);

  spinner.succeed(`Done! Template registry updated.`);
}

function parseArgs(args: Array<string>): {
  globs: Array<string>;
  'registry-file': string;
  check: boolean;
} {
  return yargs(args)
    .scriptName('sync-template-registry')
    .command('$0 <globs...>', 'Sync template registry', (command) =>
      command
        .positional('globs', {
          type: 'string',
          array: true,
          describe: 'One or more paths or globs specifying the files to act on.',
          demandOption: true,
        })
        .option('registry-file', {
          type: 'string',
          default: 'addon/template-registry.ts',
          describe: "The path to the file exposing the addon's template registry",
        })
        .option('check', {
          type: 'boolean',
          default: false,
          describe: 'Stop at checking whether or not the registry is out of sync',
        })
    )
    .wrap(100)
    .strict()
    .parseSync();
}

// For the given file path, returns all items from the Glint registry
function findGlintRegistryMembers(fileContents: string): { name: string; type: string }[] {
  let members: { name: string; type: string }[] = [];
  let traverse = AST.traverse(true);

  traverse(fileContents, {
    visitTSModuleDeclaration(path) {
      if (path.node.id.type !== 'StringLiteral') {
        return false;
      }

      let moduleName = path.node.id.value;

      if (moduleName !== '@glint/environment-ember-loose/registry') return false;

      return this.traverse(path, {
        visitTSInterfaceDeclaration(path) {
          if (path.value.id.name !== 'Registry') return false;

          path.value.body.body.forEach((node: any) => {
            members.push({
              name: node.key.value,
              type: node.typeAnnotation.typeAnnotation.exprName.name,
            });
          });

          return false;
        },
      });
    },
  });

  return members;
}

async function updateTemplateRegistry(
  cwd: string,
  filePath: string,
  registryMembers: Map<string, { name: string; type: string }[]>,
  shouldCreateRegistryFile: boolean
): Promise<void> {
  if (shouldCreateRegistryFile) {
    await writeFile(join(cwd, filePath), TEMPLATE_REGISTRY_TMPL);
    return;
  }

  let imports: Set<string> = new Set();
  let registryDeclarations: string[] = [];
  let packageName = await getPackageName(cwd);

  for (let [filePath, members] of registryMembers) {
    members.forEach((m) => {
      registryDeclarations.push(`'${m.name}': typeof ${m.type};`);
      imports.add(
        `import type ${m.type} from '${relative(cwd, filePath).replace(
          'addon/',
          `${packageName}/`
        )}';`
      );
    });
  }

  await writeFile(
    join(cwd, filePath),
    TEMPLATE_REGISTRY_TMPL.replace(
      '[[registry_declarations]]',
      registryDeclarations.join('\n')
    ).replace('[[imports]]', Array.from(imports).join('\n'))
  );
}

async function getPackageName(fromDir: string): Promise<string> {
  let packageJsonContents = await readFile(resolve(fromDir, 'package.json'), 'utf-8');
  return JSON.parse(packageJsonContents).name;
}

const TEMPLATE_REGISTRY_TMPL = `
[[imports]]

export default interface AddonRegistry {
  [[registry_declarations]]
}
`;

// TODO:
// - handle check only
// - generate diff
// - merge with existing? might be hard if there are js types we don't know of
