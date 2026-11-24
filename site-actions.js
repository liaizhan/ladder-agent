// Registers the Ladder page's operations with the agent runtime.
// Only the names in agent-manifest.json "actions.agentTools" become website_<name> tools.
import { App } from "./js/ladder-page.js";

const ZONE_ENUM = ["current", "block", "goal", "fear"];
const SHORT = { type: "string", maxLength: 300 };

/**
 * The Ladder page's actions. Each wraps a method the page's own buttons use.
 * None is irreversible: every change can be undone with "Forget my answers".
 */
class SiteActions {
  static registerActions(actions) {
    actions.register(SiteActions.readState());
    actions.register(SiteActions.fillAnswers());
    actions.register(SiteActions.drawLadder());
    actions.register(SiteActions.forgetAnswers());
  }

  static readState() {
    return {
      name: "get_ladder_state",
      description: "Read the visitor's current answers on this page (goal, where they are now, obstacles, fears), the chosen country, the drawn ladder and the Safe Exit link. The visitor can edit the page directly, so read it again in each turn that needs it.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.getState(),
    };
  }

  static fillAnswers() {
    return {
      name: "fill_answers",
      description: "Write the visitor's own short answers into the self-check form on this page, so they can see and edit them. Only the fields given change. Returns the new state, or ok false with a reason.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          goal: { ...SHORT, description: "The measurable goal in the visitor's words." },
          me: { ...SHORT, description: "Where the visitor is now, in one sentence." },
          blocks: { type: "array", maxItems: 5, items: SHORT, description: "Obstacles from the nearest one up." },
          fears: { type: "array", maxItems: 5, items: SHORT, description: "Fears above the goal, from the bottom up." },
          country: { type: "string", enum: ["", "KZ", "US", "GB", "IE", "OTHER"], description: "The country the visitor chose: KZ, US, GB, IE, OTHER for any other country, or empty." },
        },
      },
      execute: (args) => App.page.fillAnswers(args),
    };
  }

  static drawLadder() {
    return {
      name: "draw_ladder",
      description: "Draw the ladder on this page from the steps the ladder_mapper returned (from analyze_ladder). Use the step texts exactly as returned. Returns the new state, or ok false with a reason.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["steps"],
        properties: {
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["zone", "text"],
              properties: { zone: { type: "string", enum: ZONE_ENUM }, text: SHORT },
            },
            description: "Steps from the bottom up: current, then blocks, goal, then fears.",
          },
          summary: { type: "string", maxLength: 600, description: "What the ladder shows, as returned by analyze_ladder." },
        },
      },
      execute: (args) => App.page.drawLadder(args),
    };
  }

  static forgetAnswers() {
    return {
      name: "forget_answers",
      description: "Clear the form and the drawn ladder on this page when the visitor asks to forget or start over.",
      effect: "write",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.clear(),
    };
  }
}

export const registerActions = SiteActions.registerActions;
