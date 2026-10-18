import { hasScoringOption, OPENING_SCORE, scoreSelection, scoringHints, WINNING_SCORE } from "./rules";

export type Phase = "setup" | "rollOff" | "needRoll" | "select" | "farkle" | "gameOver";

export interface Player {
  name: string;
  score: number;
  onBoard: boolean;
}

export interface Die {
  id: number;
  value: number;
  selected: boolean;
}

export interface RollOff {
  values: (number | null)[];
  contenders: number[];
  winner: number | null;
  tied: boolean;
}

export interface LastRound {
  triggeredBy: number;
  /** True until that player finishes the one turn they get after someone reaches 10,000. */
  pending: boolean[];
}

export interface GameState {
  players: Player[];
  current: number;
  phase: Phase;
  dice: Die[];
  diceToRoll: number;
  /** Points already committed this turn. The current selection is not included. */
  turnScore: number;
  /** Faces set aside during this wave. Cleared when hot dice puts all six back. */
  held: number[];
  hotDice: boolean;
  announce: string | null;
  lastRound: LastRound | null;
  winners: number[];
  rollOff: RollOff | null;
  nextDieId: number;
  farkleLost: number;
}

export interface SelectionView {
  legal: boolean;
  points: number;
  parts: string[];
  selectedCount: number;
  remaining: number;
  allSelected: boolean;
}

const HOT_DICE_ANNOUNCE = "Hot dice — all six are back in the cup. This turn score stays.";

export function createGame(): GameState {
  return {
    players: [],
    current: 0,
    phase: "setup",
    dice: [],
    diceToRoll: 6,
    turnScore: 0,
    held: [],
    hotDice: false,
    announce: null,
    lastRound: null,
    winners: [],
    rollOff: null,
    nextDieId: 1,
    farkleLost: 0,
  };
}

export function startRollOff(names: string[]): GameState {
  const cleaned = names.map((name) => name.trim().slice(0, 24));
  if (cleaned.length < 2) throw new Error("Add at least two players.");
  if (cleaned.length > 8) throw new Error("Eight players at most.");
  if (cleaned.some((name) => name.length === 0)) throw new Error("Enter a name for each player.");
  return {
    ...createGame(),
    players: cleaned.map((name) => ({ name, score: 0, onBoard: false })),
    phase: "rollOff",
    rollOff: {
      values: cleaned.map(() => null),
      contenders: cleaned.map((_, index) => index),
      winner: null,
      tied: false,
    },
  };
}

function assertFaces(values: number[], count: number): void {
  if (values.length !== count) throw new Error(`Expected ${count} dice, got ${values.length}.`);
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error(`Invalid die: ${value}`);
  }
}

export function rollForFirst(state: GameState, values: number[]): GameState {
  if (state.phase !== "rollOff" || !state.rollOff) throw new Error("Not rolling for first.");
  if (state.rollOff.winner !== null) throw new Error("First player is already set.");
  assertFaces(values, state.rollOff.contenders.length);
  const nextValues = state.rollOff.values.slice();
  state.rollOff.contenders.forEach((playerIndex, rollIndex) => {
    nextValues[playerIndex] = values[rollIndex];
  });
  const best = Math.max(...state.rollOff.contenders.map((index) => nextValues[index] as number));
  const leaders = state.rollOff.contenders.filter((index) => nextValues[index] === best);
  if (leaders.length === 1) {
    return {
      ...state,
      rollOff: {
        values: nextValues,
        contenders: state.rollOff.contenders,
        winner: leaders[0],
        tied: false,
      },
    };
  }
  return {
    ...state,
    rollOff: {
      values: nextValues,
      contenders: leaders,
      winner: null,
      tied: true,
    },
  };
}

export function beginPlay(state: GameState): GameState {
  if (state.phase !== "rollOff" || !state.rollOff || state.rollOff.winner === null) {
    throw new Error("Roll for first player before the game starts.");
  }
  return freshTurn({ ...state, rollOff: null }, state.rollOff.winner);
}

function freshTurn(state: GameState, current: number): GameState {
  return {
    ...state,
    current,
    phase: "needRoll",
    dice: [],
    diceToRoll: 6,
    turnScore: 0,
    held: [],
    hotDice: false,
    announce: null,
    farkleLost: 0,
  };
}

export function applyRoll(state: GameState, values: number[]): GameState {
  if (state.phase !== "needRoll") throw new Error("It is not time to roll.");
  assertFaces(values, state.diceToRoll);
  let nextDieId = state.nextDieId;
  const dice: Die[] = values.map((value) => ({ id: nextDieId++, value, selected: false }));
  const landed = { ...state, dice, nextDieId, hotDice: false };
  if (!hasScoringOption(values)) {
    return { ...landed, phase: "farkle", farkleLost: state.turnScore };
  }
  return { ...landed, phase: "select" };
}

export function toggleDie(state: GameState, id: number): GameState {
  if (state.phase !== "select") return state;
  if (!state.dice.some((die) => die.id === id)) return state;
  return {
    ...state,
    dice: state.dice.map((die) => (die.id === id ? { ...die, selected: !die.selected } : die)),
  };
}

/** Keep every die that can score on this roll. Non-scoring dice are left unselected. */
export function selectScoringDice(state: GameState): GameState {
  if (state.phase !== "select") return state;
  const hints = scoringHints(state.dice.map((die) => die.value));
  return {
    ...state,
    dice: state.dice.map((die, index) => ({ ...die, selected: hints[index] })),
  };
}

export function canSelectScoringDice(state: GameState): boolean {
  if (state.phase !== "select") return false;
  const hints = scoringHints(state.dice.map((die) => die.value));
  return hints.some((hint, index) => hint && !state.dice[index].selected);
}

export function selectionView(state: GameState): SelectionView {
  const selected = state.dice.filter((die) => die.selected).map((die) => die.value);
  const scored = selected.length > 0 ? scoreSelection(selected) : null;
  const selectedCount = selected.length;
  const allSelected = state.dice.length > 0 && selectedCount === state.dice.length;
  return {
    legal: scored !== null,
    points: scored?.points ?? 0,
    parts: scored?.parts ?? [],
    selectedCount,
    remaining: allSelected ? 6 : state.dice.length - selectedCount,
    allSelected,
  };
}

export function canBank(state: GameState): { ok: boolean; reason: string } {
  if (state.phase !== "select") return { ok: false, reason: "" };
  const selection = selectionView(state);
  if (!selection.legal) {
    return { ok: false, reason: "Select a scoring combination from this roll." };
  }
  const total = state.turnScore + selection.points;
  const player = state.players[state.current];
  if (!player.onBoard && total < OPENING_SCORE) {
    return {
      ok: false,
      reason: `You need ${OPENING_SCORE} points in one turn to get on the board. Banking now would be ${total}.`,
    };
  }
  return { ok: true, reason: "" };
}

export function canRollRemaining(state: GameState): boolean {
  return state.phase === "select" && selectionView(state).legal;
}

export function commitAndRoll(state: GameState): GameState {
  if (!canRollRemaining(state)) throw new Error("Select a scoring combination before rolling.");
  const selection = selectionView(state);
  const turnScore = state.turnScore + selection.points;
  if (selection.allSelected) {
    return {
      ...state,
      turnScore,
      held: [],
      dice: [],
      diceToRoll: 6,
      hotDice: true,
      announce: HOT_DICE_ANNOUNCE,
      phase: "needRoll",
    };
  }
  const kept = state.dice.filter((die) => die.selected).map((die) => die.value);
  return {
    ...state,
    turnScore,
    held: [...state.held, ...kept],
    dice: [],
    diceToRoll: state.dice.length - kept.length,
    hotDice: false,
    announce: null,
    phase: "needRoll",
  };
}

export function bank(state: GameState): GameState {
  const gate = canBank(state);
  if (!gate.ok) throw new Error(gate.reason || "You cannot bank yet.");
  const total = state.turnScore + selectionView(state).points;
  const players = state.players.map((player, index) =>
    index === state.current ? { ...player, score: player.score + total, onBoard: true } : player,
  );
  return finishTurn({ ...state, players }, state.current);
}

export function acknowledgeFarkle(state: GameState): GameState {
  if (state.phase !== "farkle") throw new Error("There is no Farkle to continue from.");
  return finishTurn(state, null);
}

function finishTurn(state: GameState, bankingIndex: number | null): GameState {
  if (bankingIndex !== null && bankingIndex !== state.current) {
    throw new Error("Only the current player can bank.");
  }
  let lastRound = state.lastRound;
  if (bankingIndex !== null && !lastRound && state.players[bankingIndex].score >= WINNING_SCORE) {
    lastRound = {
      triggeredBy: bankingIndex,
      pending: state.players.map((_, index) => index !== bankingIndex),
    };
  }
  if (lastRound) {
    const pending = lastRound.pending.slice();
    pending[state.current] = false;
    const round: LastRound = { triggeredBy: lastRound.triggeredBy, pending };
    const next = nextPending(state.current, pending);
    if (next === null) return endGame({ ...state, lastRound: round });
    return freshTurn({ ...state, lastRound: round }, next);
  }
  return freshTurn(state, (state.current + 1) % state.players.length);
}

function nextPending(from: number, pending: boolean[]): number | null {
  for (let step = 1; step <= pending.length; step += 1) {
    const index = (from + step) % pending.length;
    if (pending[index]) return index;
  }
  return null;
}

function endGame(state: GameState): GameState {
  const best = Math.max(...state.players.map((player) => player.score));
  const winners = state.players.flatMap((player, index) => (player.score === best ? [index] : []));
  return {
    ...state,
    phase: "gameOver",
    dice: [],
    held: [],
    diceToRoll: 6,
    turnScore: 0,
    hotDice: false,
    announce: null,
    farkleLost: 0,
    winners,
  };
}
