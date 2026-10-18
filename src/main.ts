import {
  acknowledgeFarkle,
  applyRoll,
  bank,
  beginPlay,
  canBank,
  canRollRemaining,
  canSelectScoringDice,
  commitAndRoll,
  createGame,
  rollForFirst,
  selectScoringDice,
  selectionView,
  startRollOff,
  toggleDie,
  type GameState,
} from "./game";
import { isFast, rollFaces } from "./random";
import { formatPoints, OPENING_SCORE, SCORING_TABLE, scoringHints, WINNING_SCORE } from "./rules";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");
const app: HTMLElement = root;

let state: GameState = createGame();
let names = ["", ""];
const ui = {
  rulesOpen: false,
  rolling: false,
  preview: null as number[] | null,
  farkleOn: false,
  error: "",
};
let rollGen = 0;

function motion(normal: number, fast: number): number {
  return isFast() ? fast : normal;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char];
  });
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function joinNames(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function dieMarkup(options: {
  value: number;
  id?: number;
  hint?: boolean;
  selected?: boolean;
  bad?: boolean;
  preview?: boolean;
  mini?: boolean;
  testId?: string;
}): string {
  const classes = ["die"];
  if (options.mini) classes.push("mini");
  if (options.hint) classes.push("hint");
  if (options.selected) classes.push("selected");
  if (options.bad) classes.push("bad");
  if (options.preview) classes.push("rolling");
  const interactive = options.id !== undefined;
  const tag = interactive ? "button" : "div";
  const attrs = [
    `class="${classes.join(" ")}"`,
    `data-value="${options.value}"`,
    `data-hint="${options.hint ? "true" : "false"}"`,
    `data-selected="${options.selected ? "true" : "false"}"`,
    options.testId ? `data-testid="${options.testId}"` : "",
    options.preview ? 'data-preview-die="true"' : "",
    interactive
      ? `type="button" data-die-id="${options.id}" aria-pressed="${options.selected ? "true" : "false"}" aria-label="Die showing ${options.value}${options.hint ? ", can score" : ""}"`
      : 'aria-hidden="true"',
  ].filter(Boolean);
  return `<${tag} ${attrs.join(" ")}>${"<i></i>".repeat(9)}</${tag}>`;
}

function syncNames(): void {
  const inputs = app.querySelectorAll<HTMLInputElement>("[data-name-index]");
  if (inputs.length === 0) return;
  names = Array.from(inputs, (input) => input.value);
}

function header(): string {
  return `<header class="top">
    <div>
      <p class="eyebrow">The classic dice game</p>
      <h1>Farkle</h1>
    </div>
    <button type="button" class="rules-button" data-testid="rules-button" data-action="rules" aria-label="Scoring combinations" aria-expanded="${ui.rulesOpen ? "true" : "false"}" title="Scoring combinations">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect>
        <path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    </button>
  </header>`;
}

function rulesModal(): string {
  const rows = SCORING_TABLE.map(
    (row) => `<tr><td>${escapeHtml(row.combination)}</td><td>${formatPoints(row.points)}</td></tr>`,
  ).join("");
  return `<div class="modal-back" data-action="close-rules" data-testid="rules-modal">
    <div class="modal" data-action="noop" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div class="modal-head">
        <h2 id="rules-title">Scoring</h2>
        <button type="button" class="text-btn" data-action="close-rules">Close</button>
      </div>
      <div class="rules-grid">
        <table>
          <caption class="sr-only">Scoring combinations from a single roll</caption>
          <thead><tr><th>Combination</th><th>Points</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <ul class="rules-list">
          <li>Set aside at least one scoring die after every roll. You choose which scoring dice to keep. A gold glow is only a hint.</li>
          <li>Only dice from the current roll form a combination. A 5 you already set aside does not join later 5s to make three of a kind.</li>
          <li>Hot dice: if you set aside every die, you may roll all six again and keep adding to this turn.</li>
          <li>A roll with nothing you can score is a Farkle. You lose the points from this turn. Points already banked stay.</li>
          <li>The first time on the board, the turn must reach ${formatPoints(OPENING_SCORE)} before you stop. After that, you may bank any turn.</li>
          <li>At ${formatPoints(WINNING_SCORE)} or more, each other player gets one last turn. The highest score wins. A tie stands.</li>
          <li>Each player rolls one die to start. The high roll goes first, then play passes down the list.</li>
        </ul>
      </div>
    </div>
  </div>`;
}

function setupView(): string {
  const fields = names
    .map(
      (name, index) => `<div class="name-row">
        <label>
          <span>Player ${index + 1}</span>
          <input type="text" maxlength="24" data-testid="player-name" data-name-index="${index}" value="${escapeHtml(name)}" placeholder="Name" autocomplete="off" />
        </label>
        ${names.length > 2 ? `<button type="button" class="text-btn" data-action="remove-player" data-index="${index}">Remove</button>` : ""}
      </div>`,
    )
    .join("");
  return `<section class="panel setup">
    <p class="eyebrow">Pass and play</p>
    <h2>Who’s playing?</h2>
    <p class="lede">Two or more players share this screen and take turns. The table keeps score. Getting on the board takes ${formatPoints(OPENING_SCORE)} in one turn. At ${formatPoints(WINNING_SCORE)}, everyone else gets one last turn.</p>
    <form data-testid="setup-form">
      ${fields}
      <div class="setup-actions">
        ${names.length < 8 ? `<button type="button" class="text-btn" data-testid="add-player" data-action="add-player">Add player</button>` : ""}
        <button type="submit" class="primary" data-testid="start-game">Continue</button>
      </div>
    </form>
  </section>`;
}

function rollOffView(): string {
  const rollOff = state.rollOff;
  if (!rollOff) return "";
  const winner = rollOff.winner;
  let message = "Each player rolls one die. The high roll goes first, then play passes down the list.";
  if (winner !== null) message = `${state.players[winner].name} rolled the high die and goes first.`;
  else if (rollOff.tied) {
    message = `Tie for the high roll. ${joinNames(rollOff.contenders.map((index) => state.players[index].name))} roll again.`;
  }
  const rows = state.players
    .map((player, index) => {
      const contenderPos = rollOff.contenders.indexOf(index);
      let die = `<div class="die empty" aria-hidden="true"></div>`;
      if (ui.rolling && contenderPos >= 0 && ui.preview) {
        die = dieMarkup({ value: ui.preview[contenderPos] ?? 1, preview: true });
      } else if (rollOff.values[index] !== null) {
        die = dieMarkup({ value: rollOff.values[index] as number });
      }
      const classes = ["rolloff-card"];
      if (winner === index) classes.push("winner");
      return `<li class="${classes.join(" ")}" data-testid="roll-off-die" data-name="${escapeHtml(player.name)}" data-value="${rollOff.values[index] ?? ""}">
        <p>${escapeHtml(player.name)}</p>
        ${die}
      </li>`;
    })
    .join("");
  const button =
    winner === null
      ? `<button type="button" class="primary" data-testid="roll-off-button" data-action="roll-off" ${ui.rolling ? "disabled" : ""}>${rollOff.tied ? "Roll again" : "Roll for first"}</button>`
      : `<button type="button" class="primary" data-testid="begin-play" data-action="begin">Start ${escapeHtml(state.players[winner].name)}'s turn</button>`;
  return `<section class="panel">
    <h2>Who goes first?</h2>
    <p data-testid="roll-off-result">${escapeHtml(message)}</p>
    <ul class="rolloff">${rows}</ul>
    <div class="actions">${button}</div>
  </section>`;
}

function playerMeta(index: number): string {
  const player = state.players[index];
  if (state.phase === "gameOver") return state.winners.includes(index) ? "Winner" : "Finished";
  if (state.lastRound) {
    const taking = index === state.current && state.lastRound.pending[index];
    const last = taking
      ? "Last turn now"
      : state.lastRound.pending[index]
        ? "Last turn coming"
        : index === state.lastRound.triggeredBy
          ? "Opened the final round"
          : "Last turn done";
    if (!player.onBoard && (state.lastRound.pending[index] || taking)) return `${last} · needs 500 to open`;
    return last;
  }
  if (!player.onBoard) return "Needs 500 to open";
  return "On the board";
}

function scoreboard(): string {
  return `<div class="scores">${state.players
    .map((player, index) => {
      const active = index === state.current && state.phase !== "gameOver";
      return `<article class="player-card${active ? " active" : ""}" data-testid="player-score" data-name="${escapeHtml(player.name)}" data-active="${active ? "true" : "false"}">
        <p class="player-name">${escapeHtml(player.name)}</p>
        <p class="player-points" data-testid="score-value">${formatPoints(player.score)}</p>
        <p class="player-meta">${escapeHtml(playerMeta(index))}</p>
      </article>`;
    })
    .join("")}</div>`;
}

function diceSection(): string {
  if (ui.rolling && ui.preview && state.phase === "needRoll") {
    return `<div class="dice" data-testid="dice-tray" data-rolling="true">${ui.preview
      .map((value) => dieMarkup({ value, preview: true, testId: "die" }))
      .join("")}</div>`;
  }
  if (state.phase === "select" || state.phase === "farkle") {
    const hints = scoringHints(state.dice.map((die) => die.value));
    const selection = selectionView(state);
    const bad = selection.selectedCount > 0 && !selection.legal;
    return `<div class="dice" data-testid="dice-tray" data-rolling="false">${state.dice
      .map((die, index) =>
        dieMarkup({
          value: die.value,
          id: state.phase === "select" ? die.id : undefined,
          hint: state.phase === "select" && hints[index],
          selected: die.selected,
          bad: bad && die.selected,
          testId: "die",
        }),
      )
      .join("")}</div>`;
  }
  const noun = state.diceToRoll === 1 ? "die" : "dice";
  const prompt = state.hotDice ? "Hot dice. Roll all six." : `Roll ${state.diceToRoll} ${noun}.`;
  return `<div class="dice dice-empty" data-testid="dice-tray" data-rolling="false"><p class="cup">${prompt}</p></div>`;
}

function heldSection(): string {
  if (state.held.length === 0) return "";
  return `<div class="held" data-testid="held"><span>Set aside</span><div class="held-dice">${state.held
    .map((value) => dieMarkup({ value, mini: true, testId: "held-die" }))
    .join("")}</div></div>`;
}

function selectionBlock(): string {
  if (state.phase !== "select") return "";
  const selection = selectionView(state);
  let text = "Select dice to keep. Glowing dice can score.";
  let tone = "idle";
  if (selection.selectedCount > 0 && !selection.legal) {
    text = "That selection doesn't score. Keep a scoring combination from this roll.";
    tone = "bad";
  } else if (selection.legal) {
    text = `Worth ${formatPoints(selection.points)} — ${selection.parts.join(" + ")}`;
    tone = "good";
  }
  const note = selection.legal
    ? `<p class="commit-note" data-testid="commit-note">Not added yet. Roll or bank to put these points on the turn score.</p>`
    : "";
  return `<div class="selection-block"><p class="selection ${tone}" data-testid="selection-points">${escapeHtml(text)}</p>${note}</div>`;
}

function actions(): string {
  if (ui.rolling) return `<p class="rolling-label" data-testid="rolling-label">Rolling…</p>`;
  if (state.phase === "needRoll") {
    const noun = state.diceToRoll === 1 ? "die" : "dice";
    return `<div class="actions"><button type="button" class="primary" data-testid="roll-button" data-action="roll">Roll ${state.diceToRoll} ${noun}</button></div>`;
  }
  if (state.phase !== "select") return "";
  const selection = selectionView(state);
  const gate = canBank(state);
  const rollLabel = !selection.legal
    ? "Roll remaining"
    : selection.allSelected
      ? "Hot dice — roll 6"
      : `Roll ${selection.remaining} ${selection.remaining === 1 ? "die" : "dice"}`;
  const bankLabel = selection.legal ? `Bank ${formatPoints(state.turnScore + selection.points)}` : "Bank";
  const reason =
    !gate.ok && selection.selectedCount > 0
      ? `<p class="reason" data-testid="bank-reason">${escapeHtml(gate.reason)}</p>`
      : "";
  return `<div class="actions">
      <button type="button" class="secondary" data-testid="select-scoring" data-action="select-scoring" ${canSelectScoringDice(state) ? "" : "disabled"}>Select all scoring dice</button>
      <button type="button" class="primary" data-testid="roll-button" data-action="roll" ${canRollRemaining(state) ? "" : "disabled"}>${rollLabel}</button>
      <button type="button" class="secondary" data-testid="bank-button" data-action="bank" ${gate.ok ? "" : "disabled"}>${bankLabel}</button>
    </div>${reason}`;
}

function playView(): string {
  const player = state.players[state.current];
  const opening = player.onBoard
    ? ""
    : `<p class="opening-note" data-testid="opening-note">Get on the board with ${formatPoints(OPENING_SCORE)} or more in this turn before you can bank.</p>`;
  const lastRound = state.lastRound
    ? `<p class="banner" data-testid="last-round">${escapeHtml(state.players[state.lastRound.triggeredBy].name)} reached ${formatPoints(WINNING_SCORE)}. Every other player gets one last turn. ${escapeHtml(
        state.lastRound.pending.some(Boolean)
          ? `Still to roll: ${joinNames(state.players.filter((_, index) => state.lastRound?.pending[index]).map((entry) => entry.name))}.`
          : "",
      )}</p>`
    : "";
  return `<section class="play">
    ${scoreboard()}
    ${lastRound}
    <div class="turn-row">
      <div>
        <h2 data-testid="current-player">${escapeHtml(possessive(player.name))} turn</h2>
      </div>
      <div class="turn-score-block">
        <span class="turn-label">Turn score</span>
        <strong data-testid="turn-score">${formatPoints(state.turnScore)}</strong>
      </div>
    </div>
    ${opening}
    ${state.announce ? `<p class="announce" data-testid="hot-dice">${escapeHtml(state.announce)}</p>` : ""}
    <p class="legend"><span class="swatch"></span> Gold glow means that die can score. Tap to keep it. Nothing is kept for you.</p>
    ${diceSection()}
    ${heldSection()}
    ${selectionBlock()}
    ${actions()}
  </section>`;
}

function gameOverView(): string {
  const namesWon = state.winners.map((index) => state.players[index].name);
  const score = formatPoints(state.players[state.winners[0]]?.score ?? 0);
  const heading = namesWon.length === 1 ? `${namesWon[0]} wins with ${score}` : `${joinNames(namesWon)} tie at ${score}`;
  const lines = state.players
    .map((player, index) => {
      const mark = state.winners.includes(index) ? "Winner" : "";
      return `<li><span>${escapeHtml(player.name)}</span><span>${formatPoints(player.score)}</span><span>${mark}</span></li>`;
    })
    .join("");
  return `<section class="panel">
    ${scoreboard()}
    <p class="eyebrow">Game over</p>
    <h2 data-testid="winner">${escapeHtml(heading)}</h2>
    <p>The highest score wins. Banked points were safe; a Farkle only drops the turn in progress.</p>
    <ul class="final-scores">${lines}</ul>
    <button type="button" class="primary" data-testid="play-again" data-action="again">Play again</button>
  </section>`;
}

function farkleOverlay(): string {
  const detail =
    state.farkleLost > 0 ? `${formatPoints(state.farkleLost)} turn points lost` : "No points from this turn";
  return `<div class="farkle-root" data-testid="farkle-overlay" role="alertdialog" aria-modal="true" aria-labelledby="farkle-word">
    <div class="farkle-shake" data-testid="farkle-shake">
      <p class="farkle-word" id="farkle-word" data-testid="farkle-word">FARKLE</p>
      <p class="farkle-sub" data-testid="farkle-lost">${escapeHtml(detail)}</p>
    </div>
    <button type="button" class="farkle-continue" data-testid="farkle-continue" data-action="farkle-next">Next player</button>
  </div>`;
}

function mainView(): string {
  if (state.phase === "setup") return setupView();
  if (state.phase === "rollOff") return rollOffView();
  if (state.phase === "gameOver") return gameOverView();
  return playView();
}

function render(): void {
  const showFarkle = ui.farkleOn && state.phase === "farkle";
  document.body.classList.toggle("is-farkle", showFarkle);
  app.innerHTML = `<div class="shell">
    ${header()}
    <main data-phase="${state.phase}" data-rolling="${ui.rolling ? "true" : "false"}">
      ${ui.error ? `<p class="error" data-testid="setup-error">${escapeHtml(ui.error)}</p>` : ""}
      ${mainView()}
    </main>
    ${ui.rulesOpen ? rulesModal() : ""}
    ${showFarkle ? farkleOverlay() : ""}
  </div>`;
  if (showFarkle) {
    queueMicrotask(() => {
      app.querySelector<HTMLButtonElement>("[data-testid='farkle-continue']")?.focus();
    });
  }
}

function afterLanding(): void {
  ui.farkleOn = false;
  if (state.phase !== "farkle") return;
  window.setTimeout(() => {
    if (state.phase !== "farkle") return;
    ui.farkleOn = true;
    render();
  }, motion(450, 40));
}

function runAnimation(finalValues: number[], done: () => void): void {
  const gen = ++rollGen;
  ui.rolling = true;
  ui.preview = finalValues.map(() => 1 + Math.floor(Math.random() * 6));
  ui.error = "";
  render();
  const started = performance.now();
  const duration = motion(880, 50);
  const tick = window.setInterval(() => {
    if (gen !== rollGen) {
      window.clearInterval(tick);
      return;
    }
    ui.preview = finalValues.map(() => 1 + Math.floor(Math.random() * 6));
    app.querySelectorAll<HTMLElement>("[data-preview-die]").forEach((node, index) => {
      const face = ui.preview?.[index];
      if (face) node.dataset.value = String(face);
    });
    if (performance.now() - started < duration) return;
    window.clearInterval(tick);
    if (gen !== rollGen) return;
    ui.rolling = false;
    ui.preview = null;
    done();
    render();
  }, motion(70, 20));
}

function onStartRoll(): void {
  if (ui.rolling || state.phase !== "needRoll") return;
  let values: number[];
  try {
    values = rollFaces(state.diceToRoll);
  } catch (error) {
    ui.error = error instanceof Error ? error.message : "Could not roll.";
    render();
    return;
  }
  runAnimation(values, () => {
    state = applyRoll(state, values);
    afterLanding();
  });
}

function onCommitRoll(): void {
  if (ui.rolling || !canRollRemaining(state)) return;
  const next = commitAndRoll(state);
  let values: number[];
  try {
    values = rollFaces(next.diceToRoll);
  } catch (error) {
    ui.error = error instanceof Error ? error.message : "Could not roll.";
    render();
    return;
  }
  state = next;
  runAnimation(values, () => {
    state = applyRoll(state, values);
    afterLanding();
  });
}

function onRollOff(): void {
  if (ui.rolling || state.phase !== "rollOff" || !state.rollOff || state.rollOff.winner !== null) return;
  let values: number[];
  try {
    values = rollFaces(state.rollOff.contenders.length);
  } catch (error) {
    ui.error = error instanceof Error ? error.message : "Could not roll.";
    render();
    return;
  }
  runAnimation(values, () => {
    state = rollForFirst(state, values);
  });
}

function onBank(): void {
  if (ui.rolling || !canBank(state).ok) return;
  state = bank(state);
  ui.farkleOn = false;
  ui.error = "";
  render();
}

function onStart(): void {
  if (state.phase !== "setup") return;
  syncNames();
  try {
    state = startRollOff(names);
    ui.error = "";
  } catch (error) {
    ui.error = error instanceof Error ? error.message : "Could not start.";
  }
  render();
}

function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const die = target.closest<HTMLElement>("[data-die-id]");
  if (die) {
    if (ui.rolling || state.phase !== "select") return;
    state = toggleDie(state, Number(die.dataset.dieId));
    ui.error = "";
    render();
    return;
  }
  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === "noop") return;
  if (action === "rules") {
    ui.rulesOpen = !ui.rulesOpen;
    render();
    return;
  }
  if (action === "close-rules") {
    ui.rulesOpen = false;
    render();
    return;
  }
  if (action === "add-player") {
    syncNames();
    if (names.length >= 8) return;
    names.push("");
    render();
    return;
  }
  if (action === "remove-player") {
    syncNames();
    const index = Number(actionEl.dataset.index);
    if (names.length <= 2 || Number.isNaN(index)) return;
    names.splice(index, 1);
    render();
    return;
  }
  if (action === "roll-off") {
    onRollOff();
    return;
  }
  if (action === "begin") {
    if (state.phase !== "rollOff" || state.rollOff?.winner == null) return;
    state = beginPlay(state);
    ui.error = "";
    render();
    return;
  }
  if (action === "roll") {
    if (state.phase === "needRoll") onStartRoll();
    else if (state.phase === "select") onCommitRoll();
    return;
  }
  if (action === "bank") {
    onBank();
    return;
  }
  if (action === "select-scoring") {
    if (ui.rolling || !canSelectScoringDice(state)) return;
    state = selectScoringDice(state);
    ui.error = "";
    render();
    return;
  }
  if (action === "farkle-next") {
    if (state.phase !== "farkle") return;
    state = acknowledgeFarkle(state);
    ui.farkleOn = false;
    render();
    return;
  }
  if (action === "again") {
    state = createGame();
    ui.farkleOn = false;
    ui.rulesOpen = false;
    ui.error = "";
    ui.rolling = false;
    rollGen += 1;
    render();
  }
}

app.addEventListener("click", onClick);
app.addEventListener("submit", (event) => {
  event.preventDefault();
  onStart();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !ui.rulesOpen) return;
  ui.rulesOpen = false;
  render();
});

render();
