import neo4j, { Driver, Record as Neo4jRecord } from 'neo4j-driver';

let driver: Driver | null = null;

/**
 * Get or create the Neo4j driver singleton
 */
export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
      throw new Error(
        'Missing Neo4j credentials. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables.',
      );
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
    });
  }
  return driver;
}

/**
 * Get the database name for sessions.
 * AuraDB uses a specific database name (from NEO4J_DATABASE env var).
 * Local Neo4j Community uses the default database.
 */
function getDatabase(): string | undefined {
  return process.env.NEO4J_DATABASE || undefined;
}

/**
 * Close the driver connection (call on app shutdown)
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Execute a Cypher query and return typed results
 */
export async function executeQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getDriver().session({ database: getDatabase() });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record: Neo4jRecord) => {
      const obj: Record<string, unknown> = {};
      record.keys.forEach((key) => {
        obj[String(key)] = toNativeTypes(record.get(key));
      });
      return obj as T;
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Neo4j query failed', { cypher, params, error });
    }
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction (for mutations)
 */

/**
 * Convert Neo4j types to native JavaScript types
 */
function toNativeTypes(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Neo4j Integer
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  // Handle Neo4j Date/DateTime
  if (
    neo4j.isDate(value) ||
    neo4j.isDateTime(value) ||
    neo4j.isLocalDateTime(value)
  ) {
    return value.toString();
  }

  // Handle Neo4j Node
  if (value && typeof value === 'object' && 'properties' in value) {
    const node = value as { properties: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, toNativeTypes(v)]),
    );
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(toNativeTypes);
  }

  // Handle plain objects
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toNativeTypes(v)]),
    );
  }

  return value;
}

/**
 * Check database connectivity
 */
export async function verifyConnectivity(): Promise<boolean> {
  try {
    const driver = getDriver();
    await driver.verifyConnectivity();
    return true;
  } catch (error) {
    console.error('Neo4j connectivity check failed:', error);
    return false;
  }
}
