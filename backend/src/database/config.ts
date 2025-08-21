// Database configuration and connection utilities for Azure SQL Database

import { ConnectionPool, config as SqlConfig, Request } from 'mssql';

// Database configuration interface
export interface DatabaseConfig {
    server: string;
    database: string;
    user?: string;
    password?: string;
    authentication?: {
        type: 'default' | 'azure-active-directory-default' | 'azure-active-directory-msi-app-service';
    };
    options: {
        encrypt: boolean;
        trustServerCertificate: boolean;
        enableArithAbort: boolean;
        connectionTimeout: number;
        requestTimeout: number;
    };
    pool: {
        max: number;
        min: number;
        idleTimeoutMillis: number;
    };
}

// Environment-based configuration
export function getDatabaseConfig(): DatabaseConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_NAME || 'ApplicationTrackingSystem',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        authentication: isProduction ? {
            type: 'azure-active-directory-msi-app-service'
        } : undefined,
        options: {
            encrypt: true, // Always encrypt for Azure SQL
            trustServerCertificate: !isProduction, // Only for local development
            enableArithAbort: true,
            connectionTimeout: 30000, // 30 seconds
            requestTimeout: 60000, // 60 seconds
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    };
}

// Global connection pool
let pool: ConnectionPool | null = null;

/**
 * Initialize database connection pool
 */
export async function initializeDatabase(): Promise<ConnectionPool> {
    if (pool) {
        return pool;
    }

    try {
        const config = getDatabaseConfig();
        const sqlConfig: SqlConfig = {
            server: config.server,
            database: config.database,
            user: config.user,
            password: config.password,
            authentication: config.authentication,
            options: config.options,
            pool: config.pool,
        };

        pool = new ConnectionPool(sqlConfig);

        // Handle connection events
        pool.on('connect', () => {
            console.log('Database connected successfully');
        });

        pool.on('error', (err) => {
            console.error('Database connection error:', err);
        });

        await pool.connect();
        console.log('Database pool initialized');

        return pool;
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}

/**
 * Get database connection pool
 */
export async function getDatabase(): Promise<ConnectionPool> {
    if (!pool) {
        return await initializeDatabase();
    }

    if (!pool.connected) {
        await pool.connect();
    }

    return pool;
}

/**
 * Execute a SQL query with parameters
 */
export async function executeQuery<T = any>(
    query: string,
    parameters?: Record<string, any>
): Promise<T[]> {
    try {
        const db = await getDatabase();
        const request = new Request(db);

        // Add parameters if provided
        if (parameters) {
            Object.entries(parameters).forEach(([key, value]) => {
                request.input(key, value);
            });
        }

        const result = await request.query(query);
        return result.recordset as T[];
    } catch (error) {
        console.error('Query execution error:', error);
        throw error;
    }
}

/**
 * Execute a SQL query and return a single record
 */
export async function executeQuerySingle<T = any>(
    query: string,
    parameters?: Record<string, any>
): Promise<T | null> {
    const results = await executeQuery<T>(query, parameters);
    return results.length > 0 ? results[0] : null;
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<{
    connected: boolean;
    serverVersion?: string;
    error?: string;
}> {
    try {
        const result = await executeQuerySingle<{ version: string }>(
            'SELECT @@VERSION as version'
        );

        return {
            connected: true,
            serverVersion: result?.version,
        };
    } catch (error) {
        return {
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
    if (pool) {
        try {
            await pool.close();
            pool = null;
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error closing database connection:', error);
        }
    }
}

/**
 * Database utility functions for common operations
 */
export class DatabaseUtils {
    /**
     * Generate a new GUID for database records
     */
    static generateId(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Convert JavaScript object to JSON string for database storage
     */
    static toJsonString(obj: any): string {
        return obj ? JSON.stringify(obj) : '';
    }

    /**
     * Parse JSON string from database to JavaScript object
     */
    static fromJsonString<T = any>(jsonString: string): T | null {
        if (!jsonString) return null;

        try {
            return JSON.parse(jsonString) as T;
        } catch (error) {
            console.error('Error parsing JSON string:', error);
            return null;
        }
    }
}