/**
 * AutoCAD HTTP Server - Provides HTTP API for AutoCAD plugin communication
 *
 * Architecture:
 * 1. MCP Server adds commands to queue
 * 2. AutoCAD plugin polls /api/autocad/commands to get pending commands
 * 3. AutoCAD plugin executes commands and POSTs results to /api/autocad/command-result
 * 4. MCP Server retrieves results from completed commands
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';

/**
 * AutoCAD command in queue
 */
interface QueuedCommand {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

/**
 * Index info from AutoCAD plugin
 */
interface IndexInfo {
  path: string;
  entitiesFile: string;
  hint: string;
}

/**
 * Command result from AutoCAD plugin (CommandResultPayload from C#)
 * Structure:
 * - commandId: Command identifier
 * - success: Whether command succeeded
 * - message: Status message
 * - data: Command-specific response data (e.g., ExtractionResultData for extract)
 * - indexInfo: DWG index info (at top level, not inside data)
 * - timestamp: When the result was generated
 */
interface CommandResult {
  commandId: string;
  success: boolean;
  message?: string;
  data?: unknown;
  indexInfo?: IndexInfo;
  timestamp: Date;
}

/**
 * AutoCAD HTTP Server Manager
 */
export class AutoCADHttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number;
  private commandQueue: Map<string, QueuedCommand> = new Map();
  private isRunning = false;

  // Default port: 58273 (uncommon port to avoid conflicts, matches AutoCAD plugin)
  constructor(port = 58273) {
    this.port = port;
  }

  /**
   * Start HTTP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[AutoCAD Server] Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[AutoCAD Server] Port ${this.port} is already in use`);
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          console.error('[AutoCAD Server] Server error:', error);
          reject(error);
        }
      });

      this.server.listen(this.port, () => {
        this.isRunning = true;
        console.log(`[AutoCAD Server] HTTP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop HTTP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        console.log('[AutoCAD Server] HTTP server stopped');
        resolve();
      });
    });
  }

  /**
   * Add command to queue
   */
  addCommand(id: string, type: string, data: Record<string, unknown>): void {
    const command: QueuedCommand = {
      id,
      type,
      data,
      timestamp: new Date(),
      status: 'pending',
    };

    this.commandQueue.set(id, command);
    console.log(`[AutoCAD Server] Command queued: ${type} (ID: ${id})`);
  }

  /**
   * Get command status and result
   */
  getCommandResult(id: string): QueuedCommand | null {
    return this.commandQueue.get(id) || null;
  }

  /**
   * Wait for command completion with timeout
   */
  async waitForCommand(id: string, timeoutMs = 30000): Promise<QueuedCommand> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const command = this.commandQueue.get(id);

        if (!command) {
          clearInterval(checkInterval);
          reject(new Error(`Command ${id} not found`));
          return;
        }

        if (command.status === 'completed' || command.status === 'failed') {
          clearInterval(checkInterval);
          resolve(command);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error(`Command ${id} timed out after ${timeoutMs}ms`));
        }
      }, 100);
    });
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = parseUrl(req.url || '', true);
    const pathname = parsedUrl.pathname || '';

    try {
      // GET /api/autocad/commands - Get pending commands
      if (req.method === 'GET' && pathname === '/api/autocad/commands') {
        await this.handleGetCommands(req, res);
        return;
      }

      // POST /api/autocad/command-result - Receive command execution result
      if (req.method === 'POST' && pathname === '/api/autocad/command-result') {
        await this.handleCommandResult(req, res);
        return;
      }

      // POST /api/autocad/drawing-data - Receive drawing data
      if (req.method === 'POST' && pathname === '/api/autocad/drawing-data') {
        await this.handleDrawingData(req, res);
        return;
      }

      // Health check
      if (req.method === 'GET' && pathname === '/api/autocad/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // 404 - Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('[AutoCAD Server] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Handle GET /api/autocad/commands - Return pending commands
   */
  private async handleGetCommands(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pendingCommands = Array.from(this.commandQueue.values())
      .filter(cmd => cmd.status === 'pending')
      .map(cmd => {
        // Mark as executing when sent to plugin
        cmd.status = 'executing';
        return {
          Id: cmd.id,
          Type: cmd.type,
          Data: cmd.data,
        };
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      Commands: pendingCommands,
    }));
  }

  /**
   * Handle POST /api/autocad/command-result - Receive command execution result
   */
  private async handleCommandResult(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readRequestBody(req);
    const result: CommandResult = JSON.parse(body);

    const command = this.commandQueue.get(result.commandId);
    if (command) {
      command.status = result.success ? 'completed' : 'failed';
      command.result = result;
      command.error = result.success ? undefined : result.message;

      console.log(`[AutoCAD Server] Command ${result.commandId} ${result.success ? 'completed' : 'failed'}`);
    } else {
      console.warn(`[AutoCAD Server] Received result for unknown command: ${result.commandId}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }

  /**
   * Handle POST /api/autocad/drawing-data - Receive drawing data
   */
  private async handleDrawingData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);

    // TODO: Store drawing data for retrieval by MCP server
    console.log('[AutoCAD Server] Received drawing data:', Object.keys(data));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }

  /**
   * Read request body
   */
  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        resolve(body);
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get server status
   */
  getStatus(): { isRunning: boolean; port: number; queueSize: number } {
    return {
      isRunning: this.isRunning,
      port: this.port,
      queueSize: this.commandQueue.size,
    };
  }

  /**
   * Clear completed commands older than specified time
   */
  cleanupOldCommands(maxAgeMs = 60000): void {
    const now = Date.now();
    for (const [id, command] of this.commandQueue.entries()) {
      if (command.status === 'completed' || command.status === 'failed') {
        const age = now - command.timestamp.getTime();
        if (age > maxAgeMs) {
          this.commandQueue.delete(id);
        }
      }
    }
  }
}

/**
 * Global singleton instance
 */
let globalServer: AutoCADHttpServer | null = null;

/**
 * Get or create global AutoCAD HTTP server instance
 */
export function getAutoCADHttpServer(port = 58273): AutoCADHttpServer {
  if (!globalServer) {
    globalServer = new AutoCADHttpServer(port);
  }
  return globalServer;
}

/**
 * Start global AutoCAD HTTP server
 */
export async function startAutoCADHttpServer(port = 58273): Promise<AutoCADHttpServer> {
  const server = getAutoCADHttpServer(port);
  await server.start();
  return server;
}

/**
 * Stop global AutoCAD HTTP server
 */
export async function stopAutoCADHttpServer(): Promise<void> {
  if (globalServer) {
    await globalServer.stop();
  }
}
