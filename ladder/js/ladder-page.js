// The Ladder page: the self-check form, the drawn ladder and "forget my answers".
// Everything lives in this browser tab. Nothing is sent anywhere by this script.

const MAX_ITEMS = 5;
const ZONES = ["current", "block", "goal", "fear"];
const SAFE_EXIT_URL = "https://safe-exit-helplines.liaizhan77.workers.dev/";

/**
 * Keeps the visitor's answers and the drawn ladder, and renders both.
 * The assistant and the page's own buttons use the same methods.
 */
class LadderPage {
  constructor() {
    this.version = 0;
    this.steps = [];
    this.summary = "";
  }

  /** Bind the form and buttons once the DOM is ready. */
  mount() {
    this.form = document.querySelector("#ladder-form");
    this.ladderEl = document.querySelector("#ladder-steps");
    this.summaryEl = document.querySelector("#ladder-summary");
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.version += 1;
    });
    document.querySelector("#forget").addEventListener("click", () => this.clear());
    document.querySelector("#safe-exit-link").href = SAFE_EXIT_URL;
    this.render();
  }

  /** Read one list of inputs (blocks or fears) as trimmed, non-empty strings. */
  readList(name) {
    return [...this.form.querySelectorAll(`[name="${name}"]`)]
      .map((input) => input.value.trim())
      .filter(Boolean);
  }

  /** Write a list into its inputs, clearing the rest. */
  writeList(name, values) {
    const inputs = [...this.form.querySelectorAll(`[name="${name}"]`)];
    inputs.forEach((input, index) => {
      input.value = values[index] || "";
    });
  }

  /**
   * The page state the assistant reads.
   *
   * :return: Answers, country, the drawn ladder and the Safe Exit link.
   */
  getState() {
    return {
      version: this.version,
      answers: {
        goal: this.form.goal.value.trim(),
        me: this.form.me.value.trim(),
        blocks: this.readList("block"),
        fears: this.readList("fear"),
      },
      country: this.form.country.value,
      ladder: { steps: this.steps.map((step) => ({ ...step })), summary: this.summary },
      safeExitLink: document.querySelector("#safe-exit-link").href,
    };
  }

  /**
   * Fill the self-check form. Only the fields given change. The visitor can edit them.
   *
   * :return: The new state, or {ok: false, reason, field} when input is refused.
   */
  fillAnswers(args) {
    for (const name of ["blocks", "fears"]) {
      if (args[name] && args[name].length > MAX_ITEMS) {
        return { ok: false, reason: `At most ${MAX_ITEMS} ${name}.`, field: name };
      }
    }
    if (typeof args.goal === "string") this.form.goal.value = args.goal;
    if (typeof args.me === "string") this.form.me.value = args.me;
    if (args.blocks) this.writeList("block", args.blocks);
    if (args.fears) this.writeList("fear", args.fears);
    if (typeof args.country === "string") this.form.country.value = args.country;
    this.version += 1;
    return this.getState();
  }

  /**
   * Draw the ladder from the reading that analyze_ladder returned.
   *
   * :return: The new state, or {ok: false, reason, field}.
   */
  drawLadder(args) {
    const steps = args.steps || [];
    if (!steps.length) {
      return { ok: false, reason: "There are no steps to draw.", field: "steps" };
    }
    for (const step of steps) {
      if (!ZONES.includes(step.zone)) {
        return { ok: false, reason: `Unknown zone ${step.zone}.`, field: "steps" };
      }
    }
    this.steps = steps.map((step, index) => ({
      number: index + 1,
      zone: step.zone,
      text: String(step.text).slice(0, 300),
    }));
    this.summary = String(args.summary || "").slice(0, 600);
    this.version += 1;
    this.render();
    return this.getState();
  }

  /** Forget everything: the form, the ladder and the summary. */
  clear() {
    this.form.reset();
    this.steps = [];
    this.summary = "";
    this.version += 1;
    this.render();
    return this.getState();
  }

  /** Render the ladder, the top step first, so it reads like climbing up. */
  render() {
    this.ladderEl.replaceChildren();
    if (!this.steps.length) {
      const empty = document.createElement("li");
      empty.className = "ladder-empty";
      empty.textContent = "Your ladder appears here after the self-check.";
      this.ladderEl.append(empty);
    }
    const total = this.steps.length;
    [...this.steps].reverse().forEach((step, i) => {
      const item = document.createElement("li");
      item.className = `step step-${step.zone}`;
      item.style?.setProperty?.("--rise", String(Math.min(total - 1 - i, 8)));
      item.style?.setProperty?.("--i", String(total - 1 - i));
      item.dataset.zone = step.zone;
      const label = document.createElement("span");
      label.className = "step-zone";
      label.textContent = { current: "I am here", block: "Obstacle", goal: "Goal", fear: "Fear" }[step.zone];
      const text = document.createElement("span");
      text.className = "step-text";
      text.textContent = step.text;
      item.append(label, text);
      this.ladderEl.append(item);
    });
    this.summaryEl.textContent = this.summary;
  }
}

export const App = { page: new LadderPage() };

if (typeof document !== "undefined" && document.querySelector("#ladder-form")) {
  App.page.mount();
}
