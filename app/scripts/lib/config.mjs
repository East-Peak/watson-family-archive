import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = resolve(PROJECT_ROOT, 'tree.config.json');

let _config = null;

export function loadConfig() {
  if (_config) return _config;
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `tree.config.json not found at ${CONFIG_PATH}.\n` +
        `Copy tree.config.example.json to tree.config.json and edit it for your tree.`,
    );
  }
  try {
    _config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to parse tree.config.json at ${CONFIG_PATH}: ${error.message}`,
    );
  }

  if (!_config?.paths || typeof _config.paths !== 'object') {
    throw new Error(
      `tree.config.json is missing a "paths" object: ${CONFIG_PATH}`,
    );
  }

  return _config;
}

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export function getTreeConfig() {
  const config = loadConfig();
  return config.tree && typeof config.tree === 'object' ? config.tree : {};
}

export function getTreeName() {
  const name = getTreeConfig().name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Family Tree';
}

export function getTreeId() {
  const id = getTreeConfig().id;
  return typeof id === 'string' && id.trim() ? id.trim() : 'family-tree';
}

export function getRootPersonSlug() {
  const slug = getTreeConfig().rootPerson;
  return typeof slug === 'string' && slug.trim() ? slug.trim() : null;
}

export function getWikiTreeAppId() {
  const source = getTreeId() || getTreeName();
  const normalized = source
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1).toLowerCase())
    .join('');

  return normalized || 'GenealogyToolkit';
}

export function getPath(key) {
  const config = loadConfig();
  const rel = config.paths?.[key];
  if (!rel || typeof rel !== 'string') {
    throw new Error(`Unknown path key: ${key}`);
  }
  return resolve(PROJECT_ROOT, rel);
}

export function getCensusCollections(country) {
  const config = loadConfig();
  return config.research?.censusCollections?.[country] || {};
}

export function getQualityGate() {
  const config = loadConfig();
  return config.research?.qualityGate || {};
}

export function getBatchSize() {
  const config = loadConfig();
  return config.research?.batchSize || 10;
}
