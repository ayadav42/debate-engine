// Shared DebateEvent type — used by both the API route and the client page.
// Must stay in sync with the DebateEvent export in demos/src/debate-runner.ts.

export interface SideConfig {
  name: string;
  label: string;
}

export interface DebateConfig {
  topic: string;
  sides: { pro: SideConfig; anti: SideConfig };
  seedGoal: string;
  seedGaps: string[];
  maxRounds?: number;
}

export type DebateEvent =
  | { type: 'config_ready'; config: DebateConfig; namespace: string }
  | { type: 'seed_done'; goal: string; gaps: string[]; namespace: string }
  | {
      type: 'round_start';
      round: number;
      maxRounds: number;
      reasoning: string;
      moveValue: number;
      proAngle: string;
      antiAngle: string;
      proLabel: string;
      antiLabel: string;
    }
  | {
      type: 'side_queries';
      side: 'pro' | 'anti';
      label: string;
      queries: string[];
    }
  | {
      type: 'side_sources';
      side: 'pro' | 'anti';
      sources: Array<{ title: string | null; url: string }>;
    }
  | {
      type: 'side_done';
      side: 'pro' | 'anti';
      label: string;
      created: number;
      clarity: number;
      contradictions: number;
      conflictPairs?: Array<{ a: string; b: string }>;
    }
  | {
      type: 'round_done';
      round: number;
      proClarity: number;
      antiClarity: number;
      contradictions: number;
    }
  | { type: 'gap_resolved'; gap: string; how: 'move' | 'seed' }
  | { type: 'early_exit'; reason: string }
  | {
      type: 'judge_state';
      totalBeliefs: number;
      established: number;
      contested: number;
      weak: number;
      gaps: string[];
      contradictionCount: number;
    }
  | { type: 'verdict_chunk'; text: string }
  | { type: 'verdict_done' }
  | {
      type: 'scorecard';
      proCreated: number;
      antiCreated: number;
      proClarity: number;
      antiClarity: number;
      contradictions: number;
      gaps: number;
      rounds: number;
      sources: number;
      judgeClarity: number;
    }
  | { type: 'done' }
  | { type: 'error'; message: string };
