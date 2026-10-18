import { describe, expect, it } from "vitest";
import {
  acknowledgeFarkle,
  applyRoll,
  bank,
  beginPlay,
  canBank,
  canSelectScoringDice,
  commitAndRoll,
  rollForFirst,
  selectScoringDice,
  selectionView,
  startRollOff,
  toggleDie,
  type GameState,
} from "../src/game";

function beginWith(names: string[], first: number): GameState {
  let state = startRollOff(names);
  const rolls = names.map((_, index) => (index === first ? 6 : 1));
  state = rollForFirst(state, rolls);
  return beginPlay(state);
}

function selectValues(state: GameState, values: number[]): GameState {
  const need = new Map<number, number>();
  for (const value of values) need.set(value, (need.get(value) ?? 0) + 1);
  let next = state;
  for (const die of state.dice) {
    const left = need.get(die.value) ?? 0;
    if (left <= 0) continue;
    next = toggleDie(next, die.id);
    need.set(die.value, left - 1);
  }
  for (const [face, left] of need) {
    if (left !== 0) throw new Error(`Could not select ${face}`);
  }
  return next;
}

function wavesOfSixes(state: GameState, waves: number, bankAtEnd: boolean): GameState {
  for (let wave = 0; wave < waves; wave += 1) {
    state = applyRoll(state, [1, 1, 1, 1, 1, 1]);
    state = selectValues(state, [1, 1, 1, 1, 1, 1]);
    const last = wave === waves - 1;
    state = last && bankAtEnd ? bank(state) : commitAndRoll(state);
  }
  return state;
}

describe("opening the game", () => {
  it("rerolls ties and gives the high die the first turn", () => {
    let state = startRollOff(["Ada", "Bo", "Cam"]);
    state = rollForFirst(state, [3, 5, 5]);
    expect(state.rollOff?.winner).toBeNull();
    expect(state.rollOff?.tied).toBe(true);
    expect(state.rollOff?.contenders).toEqual([1, 2]);
    state = rollForFirst(state, [2, 6]);
    expect(state.rollOff?.winner).toBe(2);
    state = beginPlay(state);
    expect(state.current).toBe(2);
    expect(state.phase).toBe("needRoll");
  });

  it("rejects a short roster and blank names", () => {
    expect(() => startRollOff(["Ada"])).toThrow(/two players/);
    expect(() => startRollOff(["Ada", "  "])).toThrow(/name/);
  });

  it("passes play down the list", () => {
    let state = beginWith(["Ada", "Bo", "Cam"], 1);
    state = applyRoll(state, [5, 5, 5, 2, 3, 4]);
    state = selectValues(state, [5, 5, 5]);
    state = bank(state);
    expect(state.current).toBe(2);
    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    state = acknowledgeFarkle(state);
    expect(state.current).toBe(0);
  });
});

describe("a turn", () => {
  it("selects every scoring die and clears non-scoring picks", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [1, 1, 1, 2, 3, 4]);
    expect(canSelectScoringDice(state)).toBe(true);
    state = selectValues(state, [2]);
    state = selectScoringDice(state);
    expect(state.dice.filter((die) => die.selected).map((die) => die.value)).toEqual([1, 1, 1]);
    expect(selectionView(state).points).toBe(300);
    expect(canSelectScoringDice(state)).toBe(false);
  });

  it("does not add a selection until the player commits", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [1, 1, 1, 2, 3, 4]);
    expect(state.dice.every((die) => !die.selected)).toBe(true);
    state = selectValues(state, [1]);
    expect(selectionView(state).points).toBe(100);
    expect(state.turnScore).toBe(0);
    expect(canBank(state).ok).toBe(false);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(100);
    expect(state.held).toEqual([1]);
    expect(state.diceToRoll).toBe(5);
    expect(state.phase).toBe("needRoll");
  });

  it("does not combine dice from different rolls", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [5, 2, 3, 4, 6, 6]);
    state = selectValues(state, [5]);
    state = commitAndRoll(state);
    state = applyRoll(state, [5, 5, 2, 3, 4]);
    state = selectValues(state, [5, 5]);
    expect(selectionView(state).points).toBe(100);
    expect(state.turnScore).toBe(50);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(150);
  });

  it("follows the printed sample roll", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [5, 2, 3, 4, 6, 6]);
    state = selectValues(state, [5]);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(50);

    state = applyRoll(state, [1, 4, 4, 4, 2]);
    state = selectValues(state, [1, 4, 4, 4]);
    expect(selectionView(state).points).toBe(500);
    expect(canBank(state).ok).toBe(true);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(550);
    expect(state.diceToRoll).toBe(1);

    state = applyRoll(state, [1]);
    state = selectValues(state, [1]);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(650);
    expect(state.hotDice).toBe(true);
    expect(state.diceToRoll).toBe(6);
    expect(state.held).toEqual([]);

    state = applyRoll(state, [3, 3, 3, 2, 4, 6]);
    state = selectValues(state, [3, 3, 3]);
    expect(state.turnScore + selectionView(state).points).toBe(950);
    state = bank(state);
    expect(state.players[0]).toMatchObject({ score: 950, onBoard: true });
    expect(state.current).toBe(1);
  });

  it("requires 500 to open, then allows a smaller bank", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [1, 1, 1, 5, 5, 2]);
    state = selectValues(state, [1, 1, 1, 5, 5]);
    expect(selectionView(state).points).toBe(400);
    expect(canBank(state).ok).toBe(false);
    state = commitAndRoll(state);
    state = applyRoll(state, [2]);
    expect(state.phase).toBe("farkle");
    expect(state.farkleLost).toBe(400);
    state = acknowledgeFarkle(state);
    expect(state.players[0]).toMatchObject({ score: 0, onBoard: false });

    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    state = acknowledgeFarkle(state);
    state = applyRoll(state, [5, 5, 5, 2, 3, 4]);
    state = selectValues(state, [5, 5, 5]);
    state = bank(state);
    expect(state.players[0].score).toBe(500);

    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    state = acknowledgeFarkle(state);
    state = applyRoll(state, [1, 2, 3, 4, 6, 6]);
    state = selectValues(state, [1]);
    expect(canBank(state).ok).toBe(true);
    state = bank(state);
    expect(state.players[0].score).toBe(600);
  });

  it("must roll hot dice when the turn is still under 500", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [2, 2, 2, 1, 1, 5]);
    state = selectValues(state, [2, 2, 2, 1, 1, 5]);
    expect(selectionView(state).points).toBe(450);
    expect(selectionView(state).allSelected).toBe(true);
    expect(canBank(state).ok).toBe(false);
    state = commitAndRoll(state);
    expect(state.hotDice).toBe(true);
    expect(state.turnScore).toBe(450);
    expect(state.diceToRoll).toBe(6);
  });

  it("drops only the turn score on a Farkle", () => {
    let state = beginWith(["Ada", "Bo"], 0);
    state = applyRoll(state, [5, 5, 5, 2, 3, 4]);
    state = selectValues(state, [5, 5, 5]);
    state = bank(state);
    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    state = acknowledgeFarkle(state);
    state = applyRoll(state, [1, 1, 1, 1, 1, 1]);
    state = selectValues(state, [1, 1, 1, 1, 1, 1]);
    state = commitAndRoll(state);
    expect(state.turnScore).toBe(3000);
    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    expect(state.phase).toBe("farkle");
    expect(state.farkleLost).toBe(3000);
    state = acknowledgeFarkle(state);
    expect(state.players[0].score).toBe(500);
    expect(state.players[1].score).toBe(0);
    expect(state.current).toBe(1);
  });
});

describe("winning", () => {
  it("gives every other player one last turn and the high score wins", () => {
    let state = beginWith(["Ada", "Bo", "Cam"], 0);
    state = wavesOfSixes(state, 3, false);
    expect(state.turnScore).toBe(9000);
    state = applyRoll(state, [1, 1, 1, 1, 2, 3]);
    state = selectValues(state, [1, 1, 1, 1]);
    expect(state.turnScore + selectionView(state).points).toBe(10000);
    state = bank(state);
    expect(state.players[0].score).toBe(10000);
    expect(state.lastRound?.pending).toEqual([false, true, true]);
    expect(state.current).toBe(1);

    state = applyRoll(state, [1, 2, 3, 4, 6, 6]);
    state = selectValues(state, [1]);
    expect(canBank(state).ok).toBe(false);
    state = commitAndRoll(state);
    state = applyRoll(state, [2, 3, 4, 6, 2]);
    state = acknowledgeFarkle(state);
    expect(state.players[1].score).toBe(0);
    expect(state.current).toBe(2);

    state = wavesOfSixes(state, 4, true);
    expect(state.phase).toBe("gameOver");
    expect(state.players.map((player) => player.score)).toEqual([10000, 0, 12000]);
    expect(state.winners).toEqual([2]);
  });

  it("leaves a tie when the last turns match the high score", () => {
    let state = beginWith(["Ada", "Bo", "Cam"], 0);
    state = wavesOfSixes(state, 3, false);
    state = applyRoll(state, [1, 1, 1, 1, 2, 3]);
    state = selectValues(state, [1, 1, 1, 1]);
    state = bank(state);
    state = wavesOfSixes(state, 3, false);
    state = applyRoll(state, [1, 1, 1, 1, 2, 3]);
    state = selectValues(state, [1, 1, 1, 1]);
    state = bank(state);
    state = applyRoll(state, [2, 3, 4, 6, 2, 3]);
    state = acknowledgeFarkle(state);
    expect(state.phase).toBe("gameOver");
    expect(state.winners).toEqual([0, 1]);
    expect(state.players[2].score).toBe(0);
  });
});
