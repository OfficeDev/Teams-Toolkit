import { ILogger } from "@microsoft/teams.common";

// Configuration for AI models used by different capabilities
export interface ModelConfig {
  model: string;
  apiKey: string;
  endpoint: string;
  apiVersion: string;
}

// Database configuration
export interface DatabaseConfig {
  type: "sqlite" | "mssql";
  connectionString?: string;
  server?: string;
  database?: string;
  username?: string;
  password?: string;
  sqlitePath?: string;
}

// Database configuration
export const DATABASE_CONFIG: DatabaseConfig = {
  type: process.env.RUNNING_ON_AZURE === "1" ? "mssql" : "sqlite",
  connectionString: process.env.SQL_CONNECTION_STRING,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  username: process.env.SQL_USERNAME,
  password: process.env.SQL_PASSWORD,
  sqlitePath: process.env.CONVERSATIONS_DB_PATH,
};

// Model configurations for different capabilities
export const AI_MODELS = {
  // Manager Capability - Uses lighter, faster model for routing decisions
  MANAGER: {
    model: "gpt-4o-mini",
    apiKey: process.env.AOAI_API_KEY!,
    endpoint: process.env.AOAI_ENDPOINT!,
    apiVersion: "2025-04-01-preview",
  } as ModelConfig,

  // Summarizer Capability - Uses more capable model for complex analysis
  SUMMARIZER: {
    model: process.env.AOAI_MODEL || "gpt-4o",
    apiKey: process.env.AOAI_API_KEY!,
    endpoint: process.env.AOAI_ENDPOINT!,
    apiVersion: "2025-04-01-preview",
  } as ModelConfig,

  // Action Items Capability - Uses capable model for analysis and task management
  ACTION_ITEMS: {
    model: process.env.AOAI_MODEL || "gpt-4o",
    apiKey: process.env.AOAI_API_KEY!,
    endpoint: process.env.AOAI_ENDPOINT!,
    apiVersion: "2025-04-01-preview",
  } as ModelConfig,

  // Search Capability - Uses capable model for semantic search and deep linking
  SEARCH: {
    model: process.env.AOAI_MODEL || "gpt-4o",
    apiKey: process.env.AOAI_API_KEY!,
    endpoint: process.env.AOAI_ENDPOINT!,
    apiVersion: "2025-04-01-preview",
  } as ModelConfig,

  // Default model configuration (fallback)
  DEFAULT: {
    model: process.env.AOAI_MODEL || "gpt-4o",
    apiKey: process.env.AOAI_API_KEY!,
    endpoint: process.env.AOAI_ENDPOINT!,
    apiVersion: "2025-04-01-preview",
  } as ModelConfig,
};

// Helper function to get model config for a specific capability
export function getModelConfig(capabilityType: string): ModelConfig {
  switch (capabilityType.toLowerCase()) {
    case "manager":
      return AI_MODELS.MANAGER;
    case "summarizer":
      return AI_MODELS.SUMMARIZER;
    case "actionitems":
      return AI_MODELS.ACTION_ITEMS;
    case "search":
      return AI_MODELS.SEARCH;
    default:
      return AI_MODELS.DEFAULT;
  }
}

// Environment validation
export function validateEnvironment(logger: ILogger): void {
  const requiredEnvVars = ["AOAI_API_KEY", "AOAI_ENDPOINT"];
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Validate database configuration
  if (DATABASE_CONFIG.type === "mssql") {
    const sqlRequiredVars = ["SQL_CONNECTION_STRING"];
    const sqlMissing = sqlRequiredVars.filter((envVar) => !process.env[envVar]);
    if (sqlMissing.length > 0) {
      logger.warn(
        `SQL Server configuration incomplete. Missing: ${sqlMissing.join(
          ", "
        )}. Falling back to SQLite.`
      );
      DATABASE_CONFIG.type = "sqlite";
    } else {
      logger.debug("✅ SQL Server configuration validated");
    }
  }

  logger.debug(`📦 Using database: ${DATABASE_CONFIG.type}`);
  logger.debug("✅ Environment validation passed");
}

// Model configuration logging
export function logModelConfigs(logger: ILogger): void {
  logger.debug("🔧 AI Model Configuration:");
  logger.debug(`  Manager Capability: ${AI_MODELS.MANAGER.model}`);
  logger.debug(`  Summarizer Capability: ${AI_MODELS.SUMMARIZER.model}`);
  logger.debug(`  Action Items Capability: ${AI_MODELS.ACTION_ITEMS.model}`);
  logger.debug(`  Search Capability: ${AI_MODELS.SEARCH.model}`);
  logger.debug(`  Default Model: ${AI_MODELS.DEFAULT.model}`);
}
