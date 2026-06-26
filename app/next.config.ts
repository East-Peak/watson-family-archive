import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadTreeIdentity() {
  const configPath = path.resolve(process.cwd(), '../tree.config.json');

  if (!existsSync(configPath)) {
    return {
      name: 'Family Tree',
      id: 'family-tree',
      rootPerson: '',
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const tree = parsed?.tree ?? {};

    return {
      name:
        typeof tree.name === 'string' && tree.name.trim()
          ? tree.name.trim()
          : 'Family Tree',
      id:
        typeof tree.id === 'string' && tree.id.trim()
          ? tree.id.trim()
          : 'family-tree',
      rootPerson:
        typeof tree.rootPerson === 'string' ? tree.rootPerson.trim() : '',
    };
  } catch (error) {
    console.warn(
      `Failed to read tree.config.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      name: 'Family Tree',
      id: 'family-tree',
      rootPerson: '',
    };
  }
}

const treeIdentity = loadTreeIdentity();

const nextConfig: NextConfig = {
  // CesiumJS configuration
  env: {
    CESIUM_BASE_URL: '/cesium',
    NEXT_PUBLIC_TREE_NAME: treeIdentity.name,
    NEXT_PUBLIC_TREE_ID: treeIdentity.id,
    NEXT_PUBLIC_TREE_ROOT_PERSON: treeIdentity.rootPerson,
  },
  productionBrowserSourceMaps: false,
  // Empty turbopack config to acknowledge we know about it
  // Cesium's static assets are pre-copied to public/cesium
  turbopack: {},
  // Allow external images from Wikimedia Commons
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.wikimedia.org',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
