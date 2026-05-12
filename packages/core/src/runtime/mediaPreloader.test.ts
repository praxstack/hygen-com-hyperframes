import { describe, it, expect, beforeEach } from "vitest";
import { createMediaPreloadManager } from "./mediaPreloader";

function mockMediaElement(attrs: {
  start: string;
  duration?: string;
  tag?: string;
}): HTMLMediaElement {
  const el = {
    tagName: (attrs.tag ?? "VIDEO").toUpperCase(),
    preload: "auto",
    readyState: 0,
    duration: Number.NaN,
    defaultPlaybackRate: 1,
    loop: false,
    dataset: {
      start: attrs.start,
      duration: attrs.duration,
    },
    hasAttribute: (name: string) => name === "data-start",
    getAttribute: (name: string) => {
      if (name === "data-start") return attrs.start;
      if (name === "data-duration") return attrs.duration ?? null;
      return null;
    },
    closest: () => null,
    load: () => {},
  } as unknown as HTMLMediaElement;
  return el;
}

function setupDOM(elements: HTMLMediaElement[]): void {
  const originalQuerySelector = document.querySelectorAll.bind(document);
  document.querySelectorAll = ((selector: string) => {
    if (selector === "video, audio") return elements as unknown as NodeListOf<Element>;
    return originalQuerySelector(selector);
  }) as typeof document.querySelectorAll;
}

describe("createMediaPreloadManager", () => {
  let elements: HTMLMediaElement[];

  beforeEach(() => {
    elements = [];
  });

  it("is not lazy when fewer than 6 media elements", () => {
    elements = [
      mockMediaElement({ start: "0", duration: "5" }),
      mockMediaElement({ start: "5", duration: "5" }),
    ];
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();

    expect(manager.isLazy()).toBe(false);
  });

  it("activates lazy mode with 6+ media elements", () => {
    elements = Array.from({ length: 8 }, (_, i) =>
      mockMediaElement({ start: String(i * 5), duration: "5" }),
    );
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();

    expect(manager.isLazy()).toBe(true);
  });

  it("sync promotes clips in the lookahead window", () => {
    elements = Array.from({ length: 8 }, (_, i) =>
      mockMediaElement({ start: String(i * 5), duration: "5" }),
    );
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();

    for (const el of elements) {
      el.preload = "metadata";
    }

    manager.sync(0);

    expect(elements[0].preload).toBe("auto");
    expect(elements[1].preload).toBe("auto");
    expect(elements[7].preload).toBe("metadata");
  });

  it("preloadAroundTime promotes clips near seek target", () => {
    elements = Array.from({ length: 10 }, (_, i) =>
      mockMediaElement({ start: String(i * 5), duration: "5" }),
    );
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();

    for (const el of elements) {
      el.preload = "metadata";
    }

    manager.preloadAroundTime(30);

    expect(elements[6].preload).toBe("auto");
    expect(elements[7].preload).toBe("auto");
    expect(elements[0].preload).toBe("metadata");
  });

  it("sync is a no-op when not lazy", () => {
    elements = [
      mockMediaElement({ start: "0", duration: "5" }),
      mockMediaElement({ start: "5", duration: "5" }),
    ];
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();
    manager.sync(0);

    expect(manager.isLazy()).toBe(false);
  });

  it("guarantees at least LOOKAHEAD_MIN_CLIPS are promoted", () => {
    elements = Array.from({ length: 8 }, (_, i) =>
      mockMediaElement({ start: String(i * 20), duration: "5" }),
    );
    setupDOM(elements);

    const manager = createMediaPreloadManager();
    manager.refresh();

    for (const el of elements) {
      el.preload = "metadata";
    }

    manager.sync(0);

    const promotedCount = elements.filter((el) => el.preload === "auto").length;
    expect(promotedCount).toBeGreaterThanOrEqual(2);
  });
});
