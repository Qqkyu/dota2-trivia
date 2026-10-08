import { describe, expect, it, vi } from "vitest";
import { shouldHandleAnswerShortcut } from "../src/lib/answer-shortcuts.mjs";

function targetWithin(selector) {
  const control = {};
  return {
    closest: vi.fn((selectors) => (selectors.split(", ").includes(selector) ? control : null)),
  };
}

describe("answer shortcuts", () => {
  it.each([
    ["Ctrl+A", { key: "a", ctrlKey: true }],
    ["Ctrl+C", { key: "c", ctrlKey: true }],
    ["Ctrl+D", { key: "d", ctrlKey: true }],
    ["Meta+A", { key: "a", metaKey: true }],
    ["Alt+1", { key: "1", altKey: true }],
    ["handled Enter", { key: "Enter", defaultPrevented: true }],
    ["composition Enter", { key: "Enter", isComposing: true }],
    ["composition key code", { key: "Enter", keyCode: 229 }],
  ])("leaves %s to its existing action", (_name, event) => {
    expect(shouldHandleAnswerShortcut(event)).toBe(false);
  });

  it.each([
    "input",
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable]",
    '[role~="textbox"]',
    '[role~="button"]',
    '[role~="link"]',
    '[role~="slider"]',
    '[role~="combobox"]',
  ])("preserves keyboard input within %s", (selector) => {
    const target = targetWithin(selector);
    expect(shouldHandleAnswerShortcut({ key: "Enter", target })).toBe(false);
    expect(shouldHandleAnswerShortcut({ key: " ", target })).toBe(false);
    expect(shouldHandleAnswerShortcut({ key: "1", target })).toBe(false);
  });

  it("preserves button activation when the event starts on its text node", () => {
    const target = { parentElement: targetWithin("button") };
    expect(shouldHandleAnswerShortcut({ key: "Enter", target })).toBe(false);
  });

  it("accepts plain shortcuts on the page and noninteractive descendants", () => {
    expect(shouldHandleAnswerShortcut({ key: "1", target: targetWithin("body") })).toBe(true);
    expect(shouldHandleAnswerShortcut({ key: "a", target: targetWithin("span") })).toBe(true);
    expect(shouldHandleAnswerShortcut({ key: "A", shiftKey: true, target: targetWithin("div") })).toBe(true);
  });

  it("does not require browser globals or an element target", () => {
    expect(shouldHandleAnswerShortcut({ key: "1" })).toBe(true);
    expect(shouldHandleAnswerShortcut({ key: "1", target: null })).toBe(true);
    expect(shouldHandleAnswerShortcut({ key: "1", target: {} })).toBe(true);
  });

  it("lets a search field handle its own Enter without exempting other controls", () => {
    const input = targetWithin("input");
    const options = { allowedInput: input };
    expect(shouldHandleAnswerShortcut({ key: "Enter", target: input }, options)).toBe(true);
    expect(shouldHandleAnswerShortcut({ key: "Enter", target: targetWithin("input") }, options)).toBe(false);
    expect(shouldHandleAnswerShortcut({ key: "Enter", target: targetWithin("button") }, options)).toBe(false);
    expect(shouldHandleAnswerShortcut({ key: "Enter", target: { parentElement: input } }, options)).toBe(false);
  });

  it.each(["defaultPrevented", "ctrlKey", "metaKey", "altKey", "isComposing"])(
    "preserves %s even in the allowed search field",
    (flag) => {
      const input = targetWithin("input");
      expect(shouldHandleAnswerShortcut({ key: "Enter", target: input, [flag]: true }, { allowedInput: input })).toBe(
        false,
      );
    },
  );
});
