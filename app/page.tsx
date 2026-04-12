'use client';

import { useReducer, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { DebateEvent, DebateConfig } from '@/src/types/debate';

// ─────────────────────────────────────────────────────────────────────────────
// State Types
// ─────────────────────────────────────────────────────────────────────────────

type Source = { title: string | null; url: string };

type SideState = {
  angle: string;
  queries: string[];
  sources: Source[];
  created: number;
  clarity: number;
  contradictions: number;
  conflictPairs: Array<{ a: string; b: string }>;
  done: boolean;
};

const emptySide = (): SideState => ({
  angle: '',
  queries: [],
  sources: [],
  created: 0,
  clarity: 0,
  contradictions: 0,
  conflictPairs: [],
  done: false,
});

type RoundState = {
  num: number;
  proLabel: string;
  antiLabel: string;
  reasoning: string;
  moveValue: number;
  pro: SideState;
  anti: SideState;
  proClarity: number;
  antiClarity: number;
  contradictions: number;
  resolvedGaps: string[];
  done: boolean;
};

type JudgeState = {
  totalBeliefs: number;
  established: number;
  contested: number;
  weak: number;
  gaps: string[];
  contradictionCount: number;
};

type ScorecardState = {
  proCreated: number;
  antiCreated: number;
  proClarity: number;
  antiClarity: number;
  contradictions: number;
  gaps: number;
  rounds: number;
  sources: number;
  judgeClarity: number;
};

type AppPhase =
  | 'idle'
  | 'configuring'
  | 'running'
  | 'judging'
  | 'verdict'
  | 'done'
  | 'error';

type AppState = {
  phase: AppPhase;
  config: DebateConfig | null;
  namespace: string;
  maxRounds: number;
  goal: string;
  gaps: string[];
  rounds: RoundState[];
  earlyExit: string | null;
  judgeState: JudgeState | null;
  verdictText: string;
  verdictDone: boolean;
  scorecard: ScorecardState | null;
  error: string | null;
};

const initialState: AppState = {
  phase: 'idle',
  config: null,
  namespace: '',
  maxRounds: 6,
  goal: '',
  gaps: [],
  rounds: [],
  earlyExit: null,
  judgeState: null,
  verdictText: '',
  verdictDone: false,
  scorecard: null,
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

function reducer(
  state: AppState,
  event: DebateEvent | { type: 'start_configuring' } | { type: 'reset' },
): AppState {
  if (event.type === 'reset') return { ...initialState };
  if (event.type === 'start_configuring')
    return { ...initialState, phase: 'configuring' };

  switch (event.type) {
    case 'config_ready':
      return {
        ...state,
        config: event.config,
        namespace: event.namespace,
        maxRounds: event.config.maxRounds ?? 6,
        phase: 'configuring',
      };

    case 'seed_done':
      return {
        ...state,
        goal: event.goal,
        gaps: Array.from(new Set(event.gaps)),
        namespace: event.namespace,
        phase: 'running',
      };

    case 'round_start': {
      const newRound: RoundState = {
        num: event.round,
        proLabel: event.proLabel,
        antiLabel: event.antiLabel,
        reasoning: event.reasoning,
        moveValue: event.moveValue ?? 0,
        pro: { ...emptySide(), angle: event.proAngle },
        anti: { ...emptySide(), angle: event.antiAngle },
        proClarity: 0,
        antiClarity: 0,
        contradictions: 0,
        resolvedGaps: [],
        done: false,
      };
      return { ...state, rounds: [...state.rounds, newRound] };
    }

    case 'side_queries': {
      const rounds = state.rounds.map((r) =>
        r.num === state.rounds.at(-1)?.num
          ? { ...r, [event.side]: { ...r[event.side], queries: event.queries } }
          : r,
      );
      return { ...state, rounds };
    }

    case 'side_sources': {
      const rounds = state.rounds.map((r) =>
        r.num === state.rounds.at(-1)?.num
          ? { ...r, [event.side]: { ...r[event.side], sources: event.sources } }
          : r,
      );
      return { ...state, rounds };
    }

    case 'side_done': {
      const rounds = state.rounds.map((r) =>
        r.num === state.rounds.at(-1)?.num
          ? {
              ...r,
              [event.side]: {
                ...r[event.side],
                created: event.created,
                clarity: event.clarity,
                contradictions: event.contradictions,
                conflictPairs: event.conflictPairs ?? [],
                done: true,
              },
            }
          : r,
      );
      return { ...state, rounds };
    }

    case 'round_done': {
      const rounds = state.rounds.map((r) =>
        r.num === event.round
          ? {
              ...r,
              proClarity: event.proClarity,
              antiClarity: event.antiClarity,
              contradictions: event.contradictions,
              done: true,
            }
          : r,
      );
      return { ...state, rounds };
    }

    case 'gap_resolved': {
      const rounds = state.rounds.map((r, i) =>
        i === state.rounds.length - 1
          ? { ...r, resolvedGaps: [...r.resolvedGaps, event.gap] }
          : r,
      );
      return { ...state, rounds };
    }

    case 'early_exit':
      return { ...state, earlyExit: event.reason };

    case 'judge_state':
      return { ...state, judgeState: event, phase: 'judging' };

    case 'verdict_chunk':
      return {
        ...state,
        verdictText: state.verdictText + event.text,
        phase: 'verdict',
      };

    case 'verdict_done':
      return { ...state, verdictDone: true };

    case 'scorecard':
      return { ...state, scorecard: event };

    case 'done':
      return { ...state, phase: 'done' };

    case 'error':
      return { ...state, error: event.message, phase: 'error' };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI components
// ─────────────────────────────────────────────────────────────────────────────

function ClarityBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.round(value * 100));
  return (
    <div className='flex items-center gap-2 text-xs'>
      <div className='w-24 h-1.5 bg-zinc-700 rounded-full overflow-hidden'>
        <div
          className={`h-full rounded-full clarity-bar ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='text-zinc-400 tabular-nums'>{value.toFixed(3)}</span>
    </div>
  );
}

function Badge({
  children,
  color = 'zinc',
}: {
  children: React.ReactNode;
  color?: string;
}) {
  const colors: Record<string, string> = {
    zinc: 'bg-zinc-800 text-zinc-400',
    green: 'bg-green-950 text-green-400 border border-green-800',
    red: 'bg-red-950 text-red-400 border border-red-800',
    amber: 'bg-amber-950 text-amber-400 border border-amber-800',
    cyan: 'bg-cyan-950 text-cyan-400 border border-cyan-800',
  };
  return (
    <span
      className={`inline-block text-xs px-1.5 py-0.5 rounded font-mono ${colors[color] ?? colors.zinc}`}>
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <span className='inline-block w-3 h-3 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin' />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side column
// ─────────────────────────────────────────────────────────────────────────────

function SideColumn({
  side,
  data,
  label,
}: {
  side: 'pro' | 'anti';
  data: SideState;
  label: string;
}) {
  const isBlank = data.queries.length === 0 && !data.done;
  const isPro = side === 'pro';

  return (
    <div
      className={`flex-1 min-w-0 rounded-lg border p-3 ${isPro ? 'border-green-900 bg-green-950/20' : 'border-red-900 bg-red-950/20'}`}>
      {/* Header */}
      <div
        className={`text-xs font-bold mb-2 flex items-center gap-2 ${isPro ? 'text-green-400' : 'text-red-400'}`}>
        {label}
        {!data.done && !isBlank && <Spinner />}
      </div>

      {/* Angle */}
      {data.angle && (
        <p className='text-xs text-zinc-300 mb-2 italic'>{data.angle}</p>
      )}

      {/* Queries */}
      {data.queries.length > 0 && (
        <div className='mb-2 space-y-1'>
          {data.queries.map((q, i) => (
            <div key={i} className='text-xs text-zinc-500 flex gap-1'>
              <span className='shrink-0 text-zinc-600'>{i + 1}.</span>
              <span className='italic truncate' title={q}>
                &ldquo;{q.slice(0, 80)}&rdquo;
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sources */}
      {data.sources.length > 0 && (
        <div className='mb-3 space-y-1'>
          {data.sources.map((s, i) => {
            const label = (s.title || s.url).slice(0, 65);
            const full = s.title || s.url;
            return (
              <div key={i} className='text-xs'>
                <a
                  href={s.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-zinc-400 hover:text-zinc-200 transition-colors flex items-start gap-1 group'>
                  <span className='text-zinc-600 shrink-0'>↳</span>
                  <span className='group-hover:underline leading-snug'>
                    {label}
                    {full.length > 65 ? '…' : ''}
                  </span>
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      {data.done && (
        <div className='mt-2 pt-2 border-t border-zinc-800 space-y-1.5'>
          <ClarityBar
            value={data.clarity}
            color={
              data.clarity >= 0.7
                ? 'bg-green-500'
                : data.clarity >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }
          />
          <div className='flex gap-3 text-xs text-zinc-500'>
            <span>+{data.created} beliefs</span>
            {data.contradictions > 0 && (
              <span className='text-amber-600'>
                ⚡ {data.contradictions} conflicts
              </span>
            )}
          </div>
          {/* Conflict pairs */}
          {data.conflictPairs.length > 0 && (
            <div className='mt-2 space-y-1.5'>
              <p
                className='text-xs text-zinc-600 uppercase tracking-wider cursor-help'
                title='Each card shows two sourced claims the engine found that directly contradict each other. Both are drawn from web evidence — a high conflict count means the topic is genuinely disputed, not that something went wrong.'>
                What conflicted ℹ
              </p>
              <div className='conflict-scroll max-h-48 overflow-y-auto space-y-1.5 pr-1'>
                {data.conflictPairs.map((pair, i) => {
                  const textA = pair.a || null;
                  const textB = pair.b || null;
                  if (!textA && !textB) return null;
                  return (
                    <div
                      key={i}
                      className='rounded border border-amber-900/40 bg-amber-950/20 px-2 py-1.5 space-y-1'>
                      {textA && (
                        <p
                          className='text-xs text-zinc-300 leading-snug'
                          title={textA}>
                          {textA.slice(0, 90)}
                          {textA.length > 90 ? '\u2026' : ''}
                        </p>
                      )}
                      {textA && textB && (
                        <p className='text-xs text-zinc-600'>
                          \u2194 contradicts
                        </p>
                      )}
                      {textB && (
                        <p
                          className='text-xs text-zinc-300 leading-snug'
                          title={textB}>
                          {textB.slice(0, 90)}
                          {textB.length > 90 ? '\u2026' : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {isBlank && <div className='text-xs text-zinc-600 italic'>Waiting…</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Round card
// ─────────────────────────────────────────────────────────────────────────────

function RoundCard({
  round,
  maxRounds,
}: {
  round: RoundState;
  maxRounds: number;
}) {
  return (
    <div className='border border-zinc-800 rounded-xl overflow-hidden'>
      {/* Round header */}
      <div className='bg-zinc-900 px-4 py-2 flex items-center justify-between border-b border-zinc-800'>
        <span className='text-sm font-bold text-zinc-200'>
          Round {round.num}{' '}
          <span className='text-zinc-600 font-normal'>/ {maxRounds}</span>
        </span>
        {round.done ? (
          <span className='text-xs text-zinc-500 flex items-center gap-2'>
            {round.contradictions > 0 && (
              <Badge color='amber'>⚡ {round.contradictions} conflicts</Badge>
            )}
            <span className='text-zinc-600'>done</span>
          </span>
        ) : (
          <Spinner />
        )}
      </div>

      {/* Director reasoning */}
      {round.reasoning && (
        <div className='px-4 py-2 bg-zinc-900/50 border-b border-zinc-800/50 space-y-1.5'>
          <p className='text-xs text-cyan-600 italic'>
            <span className='text-cyan-700 not-italic'>Director: </span>
            {round.reasoning}
          </p>
          {round.moveValue > 0 && (
            <div
              className='inline-flex items-center gap-1.5 text-xs'
              title='Expected information-gain score from the thinkn.ai belief graph (0–1). Below 0.1 the engine considers the topic exhausted.'>
              <span className='text-zinc-600'>Next-round value</span>
              <span
                className={`tabular-nums font-bold ${
                  round.moveValue >= 0.5
                    ? 'text-green-400'
                    : round.moveValue >= 0.1
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}>
                {round.moveValue.toFixed(3)}
              </span>
              <span
                className='text-zinc-700 cursor-help'
                title='Expected information-gain score from the thinkn.ai belief graph (0–1). Below 0.1 the engine considers the topic exhausted.'>
                ?
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sides */}
      <div className='p-3 flex gap-3'>
        <SideColumn side='pro' data={round.pro} label={round.proLabel} />
        <SideColumn side='anti' data={round.anti} label={round.antiLabel} />
      </div>

      {/* Round summary */}
      {round.done && (
        <div className='px-4 py-2 bg-zinc-900/30 border-t border-zinc-800/50 flex flex-wrap items-center gap-4'>
          <div className='flex items-center gap-2 text-xs text-zinc-500'>
            <span className='text-green-700'>{round.proLabel}</span>
            <ClarityBar
              value={round.proClarity}
              color={
                round.proClarity >= 0.7
                  ? 'bg-green-500'
                  : round.proClarity >= 0.4
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
              }
            />
          </div>
          <div className='flex items-center gap-2 text-xs text-zinc-500'>
            <span className='text-red-700'>{round.antiLabel}</span>
            <ClarityBar
              value={round.antiClarity}
              color={
                round.antiClarity >= 0.7
                  ? 'bg-green-500'
                  : round.antiClarity >= 0.4
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
              }
            />
          </div>
          {round.resolvedGaps.length > 0 && (
            <span className='text-xs text-zinc-600'>
              {round.resolvedGaps.length} gap
              {round.resolvedGaps.length > 1 ? 's' : ''} closed
            </span>
          )}
          {/* Resolved gaps */}
          {round.resolvedGaps.map((g, i) => (
            <Badge key={i} color='green'>
              Resolved: {g.replace('Unknown: ', '').slice(0, 42)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Judge + Scorecard
// ─────────────────────────────────────────────────────────────────────────────

function JudgePanel({
  judge,
  scorecard,
  totalSeedGaps,
}: {
  judge: JudgeState;
  scorecard: ScorecardState | null;
  totalSeedGaps: number;
}) {
  const resolvedGaps = Math.max(0, totalSeedGaps - judge.gaps.length);
  return (
    <div className='border border-zinc-800 rounded-xl overflow-hidden'>
      <div className='bg-zinc-900 px-4 py-2 border-b border-zinc-800'>
        <span className='text-sm font-bold text-zinc-200'>
          Judge — fused namespace
        </span>
      </div>
      <div className='p-4 grid grid-cols-2 md:grid-cols-4 gap-4'>
        <Stat label='Total beliefs' value={String(judge.totalBeliefs)} />
        <Stat
          label='Established >0.70'
          value={String(judge.established)}
          color='text-green-400'
        />
        <Stat
          label='Contested 0.40–0.70'
          value={String(judge.contested)}
          color='text-amber-400'
        />
        <Stat
          label='Weak <0.40'
          value={String(judge.weak)}
          color='text-red-400'
        />
        <Stat
          label='Contradictions'
          value={String(judge.contradictionCount)}
          color={
            judge.contradictionCount > 10 ? 'text-red-400' : 'text-amber-400'
          }
        />
        <Stat
          label='Open gaps'
          value={String(judge.gaps.length)}
          color='text-zinc-400'
        />
        {totalSeedGaps > 0 && resolvedGaps > 0 && (
          <Stat
            label='Gaps resolved'
            value={`${resolvedGaps} / ${totalSeedGaps}`}
            color='text-green-400'
          />
        )}
      </div>

      {judge.gaps.length > 0 && (
        <div className='px-4 pb-4'>
          <p className='text-xs text-zinc-600 mb-2'>Unresolved gaps:</p>
          <div className='flex flex-wrap gap-1.5'>
            {judge.gaps.slice(0, 8).map((g, i) => (
              <Badge key={i}>{g.replace(/^Unknown: /, '').slice(0, 50)}</Badge>
            ))}
            {judge.gaps.length > 8 && (
              <Badge>+{judge.gaps.length - 8} more</Badge>
            )}
          </div>
        </div>
      )}

      {scorecard && (
        <>
          <div className='border-t border-zinc-800' />
          <div className='px-4 py-3'>
            <p className='text-xs text-zinc-600 mb-3 uppercase tracking-wider'>
              Scorecard
            </p>
            <div className='grid grid-cols-2 gap-x-8 gap-y-1 text-xs'>
              <ScoreRow
                label='PRO created'
                value={String(scorecard.proCreated)}
              />
              <ScoreRow
                label='ANTI created'
                value={String(scorecard.antiCreated)}
              />
              <ScoreRow
                label='PRO clarity'
                value={scorecard.proClarity.toFixed(3)}
              />
              <ScoreRow
                label='ANTI clarity'
                value={scorecard.antiClarity.toFixed(3)}
              />
              <ScoreRow
                label='Contradictions'
                value={String(scorecard.contradictions)}
              />
              <ScoreRow
                label='Open gaps remaining'
                value={String(scorecard.gaps)}
              />
              <ScoreRow label='Rounds run' value={String(scorecard.rounds)} />
              <ScoreRow
                label='Sources ingested'
                value={String(scorecard.sources)}
              />
              <ScoreRow
                label='Judge clarity'
                value={scorecard.judgeClarity.toFixed(3)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-zinc-100',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className='text-xs text-zinc-500'>{label}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className='text-zinc-500'>{label}</span>
      <span className='text-zinc-300 tabular-nums'>{value}</span>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const questionRef = useRef<HTMLInputElement>(null);
  const feedBottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll as new content arrives
  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [state.rounds.length, state.verdictText.length, state.judgeState]);

  const runDebate = useCallback(async (question: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    dispatch({ type: 'start_configuring' });

    try {
      const res = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        dispatch({ type: 'error', message: `Server error ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as DebateEvent;
            dispatch(event);
          } catch {
            // Malformed chunk — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      dispatch({ type: 'error', message: String(err) });
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionRef.current?.value.trim();
    if (!q || state.phase !== 'idle') return;
    runDebate(q);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    dispatch({ type: 'reset' });
    setTimeout(() => questionRef.current?.focus(), 50);
  };

  const isRunning =
    state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';

  return (
    <div className='min-h-screen flex flex-col'>
      {/* ── Header ── */}
      <header className='sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <span className='text-zinc-400 text-sm'>🧠 Belief Debate Engine</span>
          {state.config && (
            <span className='text-xs text-zinc-600 max-w-xs truncate hidden sm:block'>
              {state.config.topic}
            </span>
          )}
        </div>
        <div className='flex items-center gap-3'>
          {state.rounds.length > 0 && (
            <span className='text-xs text-zinc-600'>
              Round {state.rounds.length} / {state.maxRounds}
            </span>
          )}
          {state.phase !== 'idle' && (
            <button
              onClick={handleReset}
              className='text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500'>
              Reset
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <main className='flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-6'>
        {/* ── Input form ── */}
        {state.phase === 'idle' && (
          <div className='flex flex-col items-center justify-center min-h-[60vh] gap-8'>
            <div className='text-center space-y-2'>
              <h1 className='text-2xl font-bold text-zinc-200'>
                Epistemic Debate Engine
              </h1>
              <p className='text-sm text-zinc-500'>
                Two AI agents research opposing sides of any question using live
                web evidence.
                <br />
                <span className='text-zinc-600'>
                  Powered by thinkn.ai · Exa · GPT-4o
                </span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className='w-full max-w-xl space-y-3'>
              <input
                ref={questionRef}
                type='text'
                defaultValue='Are EVs good or bad for the planet?'
                placeholder='Enter any debatable question…'
                className='w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition'
                autoFocus
              />
              <button
                type='submit'
                className='w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-200 rounded-lg py-3 text-sm font-medium transition-all'>
                Run Debate →
              </button>
            </form>

            <div className='text-xs text-zinc-700 text-center max-w-sm'>
              Debates typically run 4–8 minutes and cite 50–80 real sources.
              <br />
              Clarity stays low on contested topics — that&apos;s correct
              behaviour.
            </div>
          </div>
        )}

        {/* ── Configuring phase ── */}
        {state.phase === 'configuring' && !state.config && (
          <div className='flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50'>
            <Spinner />
            <div>
              <p className='text-sm text-zinc-200'>
                GPT-4o is designing the debate…
              </p>
              <p className='text-xs text-zinc-600'>
                Generating sides, gaps, and seed queries
              </p>
            </div>
          </div>
        )}

        {/* ── Config card ── */}
        {state.config && (
          <div className='rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge color='green'>{state.config.sides.pro.label}</Badge>
              <span className='text-zinc-600 text-xs'>vs</span>
              <Badge color='red'>{state.config.sides.anti.label}</Badge>
              {state.namespace && (
                <span className='text-xs text-zinc-700 ml-auto font-mono'>
                  {state.namespace}
                </span>
              )}
            </div>
            <p className='text-xs text-zinc-400 italic'>{state.goal}</p>
            <div className='flex flex-wrap gap-1.5'>
              {state.gaps.map((g, i) => (
                <Badge key={i}>
                  {g.replace(/^Unknown: /, '').slice(0, 55)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Early exit banner ── */}
        {state.earlyExit && (
          <div className='rounded-lg border border-cyan-900 bg-cyan-950/30 px-4 py-2.5 text-xs text-cyan-400'>
            ⊘ {state.earlyExit}
          </div>
        )}

        {/* ── Rounds ── */}
        {state.rounds.map((round) => (
          <RoundCard
            key={round.num}
            round={round}
            maxRounds={state.maxRounds}
          />
        ))}

        {/* Running spinner between rounds */}
        {isRunning && state.phase === 'running' && (
          <div className='flex items-center gap-2 text-xs text-zinc-600 py-2'>
            <Spinner />
            <span>Researching…</span>
          </div>
        )}

        {/* ── Judge state ── */}
        {state.judgeState && (
          <JudgePanel
            judge={state.judgeState}
            scorecard={state.scorecard}
            totalSeedGaps={state.gaps.length}
          />
        )}

        {/* ── Verdict ── */}
        {(state.verdictText || state.phase === 'judging') && (
          <div className='rounded-xl border border-zinc-800 overflow-hidden'>
            <div className='bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center justify-between'>
              <span className='text-sm font-bold text-zinc-200'>
                GPT-4o Verdict
              </span>
              {!state.verdictDone && <Spinner />}
            </div>
            <div
              className={`p-5 text-sm text-zinc-300 leading-relaxed ${!state.verdictDone ? 'cursor-blink' : ''}`}>
              {state.verdictText ? (
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className='text-base font-bold text-zinc-100 mt-4 mb-2 first:mt-0'>
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className='text-sm font-bold text-zinc-200 mt-4 mb-2 first:mt-0'>
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className='text-xs font-bold text-zinc-300 uppercase tracking-wider mt-4 mb-1.5 first:mt-0'>
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className='mb-3 last:mb-0 leading-relaxed'>
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong className='text-zinc-100 font-semibold'>
                        {children}
                      </strong>
                    ),
                    em: ({ children }) => (
                      <em className='text-zinc-400'>{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul className='list-disc list-inside space-y-1 mb-3 text-zinc-400'>
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className='list-decimal list-inside space-y-1 mb-3 text-zinc-400'>
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className='text-zinc-300'>{children}</li>
                    ),
                    hr: () => <hr className='border-zinc-800 my-4' />,
                    blockquote: ({ children }) => (
                      <blockquote className='border-l-2 border-zinc-700 pl-3 text-zinc-500 italic my-3'>
                        {children}
                      </blockquote>
                    ),
                    code: ({ children }) => (
                      <code className='bg-zinc-800 px-1 rounded text-xs text-amber-300'>
                        {children}
                      </code>
                    ),
                  }}>
                  {state.verdictText}
                </ReactMarkdown>
              ) : (
                <span className='text-zinc-600 italic'>
                  Synthesising evidence…
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Done state ── */}
        {state.phase === 'done' && (
          <div className='flex flex-col items-center gap-4 py-8'>
            <p className='text-xs text-zinc-600'>Debate complete.</p>
            <button
              onClick={handleReset}
              className='text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-4 py-2 rounded-lg transition-all'>
              Run another debate →
            </button>
          </div>
        )}

        {/* ── Error state ── */}
        {state.phase === 'error' && (
          <div className='rounded-lg border border-red-900 bg-red-950/30 p-4 space-y-2'>
            <p className='text-sm text-red-400 font-bold'>Error</p>
            <p className='text-xs text-red-600'>{state.error}</p>
            <button
              onClick={handleReset}
              className='text-xs text-zinc-400 hover:text-zinc-200 underline mt-1'>
              Reset
            </button>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={feedBottomRef} />
      </main>
    </div>
  );
}
