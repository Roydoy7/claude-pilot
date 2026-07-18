import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeAgentService } from './claude-agent-service.js';
import * as agentFactory from '../agents/claude-agent-factory.js';
import type { ClaudeAgent, StreamEvent } from '../agents/claude-agent.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class ControlledAgent {
  readonly gates: Array<ReturnType<typeof deferred>> = [];
  runCount = 0;
  approved: string[] = [];

  constructor(private readonly id: string) {}

  getSessionId(): string {
    return this.id;
  }

  async *run(): AsyncGenerator<StreamEvent, void, unknown> {
    this.runCount += 1;
    const gate = deferred();
    this.gates.push(gate);
    yield { type: 'state', state: { thinking: true } };
    await gate.promise;
    yield { type: 'done' };
  }

  approveToolCall(toolUseId: string): boolean {
    this.approved.push(toolUseId);
    return true;
  }
}

interface MutableServiceState {
  currentAgent: ClaudeAgent | null;
  sessionManager: { touchSession: ReturnType<typeof vi.fn> };
  requestQueue: Map<string, unknown[]>;
  processingSessions: Set<string>;
  runningAgents: Map<string, ClaudeAgent>;
}

const service = ClaudeAgentService.getInstance();
const state = service as unknown as MutableServiceState;
const originalSessionManager = state.sessionManager;

afterEach(() => {
  vi.restoreAllMocks();
  state.currentAgent = null;
  state.sessionManager = originalSessionManager;
  state.requestQueue = new Map();
  state.processingSessions = new Set();
  state.runningAgents = new Map();
});

describe('ClaudeAgentService session isolation', () => {
  it('serializes each session independently without one session clearing another', async () => {
    const agentA = new ControlledAgent('A');
    const agentB = new ControlledAgent('B');
    const agents = new Map<string, ControlledAgent>([['A', agentA], ['B', agentB]]);
    vi.spyOn(agentFactory, 'getAgentBySessionId').mockImplementation(
      (sessionId) => agents.get(sessionId) as unknown as ClaudeAgent,
    );
    state.sessionManager = { touchSession: vi.fn() };

    const a1 = service.chat({ message: 'a1', sessionId: 'A' });
    const a2 = service.chat({ message: 'a2', sessionId: 'A' });
    const b1 = service.chat({ message: 'b1', sessionId: 'B' });
    await vi.waitFor(() => {
      expect(agentA.runCount).toBe(1);
      expect(agentB.runCount).toBe(1);
    });

    agentA.gates[0].resolve();
    await a1;
    await vi.waitFor(() => expect(agentA.runCount).toBe(2));

    const b2 = service.chat({ message: 'b2', sessionId: 'B' });
    expect(agentB.runCount).toBe(1);

    agentB.gates[0].resolve();
    await b1;
    await vi.waitFor(() => expect(agentB.runCount).toBe(2));

    agentA.gates[1].resolve();
    agentB.gates[1].resolve();
    await Promise.all([a2, b2]);

    expect(agentA.runCount).toBe(2);
    expect(agentB.runCount).toBe(2);
  });

  it('routes approval to the requested session instead of currentAgent', () => {
    const agentA = new ControlledAgent('A');
    const agentB = new ControlledAgent('B');
    state.currentAgent = agentB as unknown as ClaudeAgent;
    state.runningAgents.set('A', agentA as unknown as ClaudeAgent);

    const result = service.approveToolCall('A', 'tool-A');

    expect(result.success).toBe(true);
    expect(agentA.approved).toEqual(['tool-A']);
    expect(agentB.approved).toEqual([]);
  });
});
