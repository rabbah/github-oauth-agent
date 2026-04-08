import { cleanup } from "@testing-library/react";
import { afterEach, vi, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

// Mock SVG imports
vi.mock("../astro-logo.svg", () => ({ default: "astro-logo.svg" }));
vi.mock("../astro-logo-dark.svg", () => ({ default: "astro-logo-dark.svg" }));

// Mock react-syntax-highlighter — render children as plain text
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) => children,
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
}));

// Mock @xyflow/react — these components need canvas/SVG APIs unavailable in jsdom
vi.mock("@xyflow/react", () => ({
  ReactFlow: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  Background: () => null,
  Handle: () => null,
  useReactFlow: () => ({ fitView: vi.fn() }),
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

// Mock @dagrejs/dagre — relies on native APIs not in jsdom
vi.mock("@dagrejs/dagre", () => ({
  default: {
    graphlib: {
      Graph: class {
        setDefaultEdgeLabel() {
          return this;
        }
        setGraph() {}
        setNode() {}
        setEdge() {}
        node() {
          return { x: 0, y: 0 };
        }
      },
    },
    layout() {},
  },
}));

// Mock EventSource — jsdom doesn't provide it
export type MockEventSourceInstance = InstanceType<typeof MockEventSource>;

class MockEventSource {
  static latest: MockEventSourceInstance | null = null;

  url: string;
  readyState = 0;
  private listeners: Record<string, ((evt: MessageEvent) => void)[]> = {};
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.latest = this;
  }

  addEventListener(type: string, handler: (evt: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type: string, handler: (evt: MessageEvent) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
    }
  }

  close() {
    this.readyState = 2;
  }

  // Test helper: dispatch an SSE event
  simulateEvent(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    // Named listeners
    this.listeners[type]?.forEach((h) => h(event));
    // Also fire onmessage for unnamed/message events
    if (type === "message" && this.onmessage) this.onmessage(event);
  }

  simulateError() {
    if (this.onerror) this.onerror(new Event("error"));
  }
}

Object.defineProperty(window, "EventSource", { value: MockEventSource });

// Re-export so tests can access the latest instance
export { MockEventSource };

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock scrollIntoView — not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();
