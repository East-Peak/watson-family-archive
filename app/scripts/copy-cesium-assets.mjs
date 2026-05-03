import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(process.cwd());
const sourceDir = path.join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium');
const targetDir = path.join(projectRoot, 'public', 'cesium');

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(sourceDir))) {
    console.error(`Cesium source not found: ${sourceDir}`);
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
  console.log(`Copied Cesium assets to ${targetDir}`);
}

main().catch((error) => {
  console.error('Failed to copy Cesium assets:', error);
  process.exit(1);
});
