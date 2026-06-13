/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Hook for fetching the list of available agent definitions
 * (id, display name, description) from agent-defs via IPC.
 */

import { useState, useEffect } from 'react';
import type { AgentSummary } from '../../preload/preload-types.js';

let cachedAgents: AgentSummary[] | null = null;
let cachedAgentsPromise: Promise<AgentSummary[]> | null = null;

function fetchAgentDefinitions(): Promise<AgentSummary[]> {
  if (cachedAgents) {
    return Promise.resolve(cachedAgents);
  }
  if (!cachedAgentsPromise) {
    cachedAgentsPromise = window.electronAPI.agents.list().then((agents) => {
      cachedAgents = agents;
      return agents;
    });
  }
  return cachedAgentsPromise;
}

/**
 * Returns the list of available agent definitions, fetched once and cached
 * for the lifetime of the renderer process.
 */
export function useAgentDefinitions(): AgentSummary[] {
  const [agents, setAgents] = useState<AgentSummary[]>(cachedAgents ?? []);

  useEffect(() => {
    if (cachedAgents) {
      return;
    }
    fetchAgentDefinitions().then(setAgents);
  }, []);

  return agents;
}
