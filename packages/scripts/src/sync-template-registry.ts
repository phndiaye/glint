#!/usr/bin/env node

import { syncTemplateRegistry } from './lib/_sync-template-registry.js';

try {
  await syncTemplateRegistry(process.argv.slice(2));
  process.exit(0);
} catch (error: any) {
  console.error(error?.message ?? error);
  process.exit(1);
}
