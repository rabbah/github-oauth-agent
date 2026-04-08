import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { MockEventSource } from "./test/setup";

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------
function mockFetch(overrides?: {
  health?: { ok: boolean };
  config?: object | null;
  conversations?: { ok: boolean };
  messages?: { ok: boolean };
}) {
  const health = overrides?.health ?? { ok: true };
  const config =
    overrides && "config" in overrides
      ? overrides.config
      : {
          systemPrompt: "You are a helpful assistant.",
          tools: [{ name: "search", title: "Search", description: "Search the web", type: "other" }],
        };
  const conversations = overrides?.conversations ?? { ok: true };
  const messages = overrides?.messages ?? { ok: true };

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/health")) {
        if (!health.ok) return Promise.reject(new Error("Network error"));
        return Promise.resolve({ ok: true } as Response);
      }
      if (url.endsWith("/api/agent/config")) {
        return Promise.resolve({
          ok: config !== null,
          json: () => Promise.resolve(config),
        } as Response);
      }
      if (url.endsWith("/api/conversations") && init?.method === "POST") {
        if (!conversations.ok)
          return Promise.reject(new Error("Failed to create conversation"));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversation_id: "test-conv-123" }),
        } as Response);
      }
      if (url.includes("/api/conversations/") && url.endsWith("/messages") && init?.method === "POST") {
        if (!messages.ok)
          return Promise.reject(new Error("Failed to send message"));
        return Promise.resolve({ ok: true } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  MockEventSource.latest = null;
});

// ---------------------------------------------------------------------------
// Connection error
// ---------------------------------------------------------------------------
describe("Connection error", () => {
  it("renders error state when /health fails", async () => {
    mockFetch({ health: { ok: false } });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
    });
  });

  it("retry button re-checks connection", async () => {
    const user = userEvent.setup();
    mockFetch({ health: { ok: false } });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
    });

    // Now make health succeed
    mockFetch({ health: { ok: true } });

    await user.click(screen.getByText("Retry Connection"));

    await waitFor(() => {
      expect(screen.queryByText("Connection Error")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe("Empty state", () => {
  it("shows 'Agent Playground' heading and prompt text", async () => {
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Send a message below to start a conversation/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
describe("Header", () => {
  it("renders logo images, ViewToggle, and ThemeToggle", async () => {
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    // Logos (there are two in the header + two in EmptyState)
    const logos = screen.getAllByAltText("Astro");
    expect(logos.length).toBeGreaterThanOrEqual(2);

    // ViewToggle buttons
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Config")).toBeInTheDocument();

    // ThemeToggle
    expect(
      screen.getByTitle(/Switch to dark mode|Switch to light mode/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ViewToggle
// ---------------------------------------------------------------------------
describe("ViewToggle", () => {
  it("Chat is active by default; clicking Config switches view", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    // Chat view is showing (empty state visible)
    expect(screen.getByText("Agent Playground")).toBeInTheDocument();

    // Switch to Config
    await user.click(screen.getByText("Config"));

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------
describe("ThemeToggle", () => {
  it("toggles .dark class on <html>", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const toggle = screen.getByTitle(/Switch to dark mode|Switch to light mode/);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chat input
// ---------------------------------------------------------------------------
describe("Chat input", () => {
  it("textarea is present and submit is disabled when empty", async () => {
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    expect(textarea).toBeInTheDocument();

    // Submit button should be disabled when input is empty
    const submitButton = textarea
      .closest("form")!
      .querySelector('button[type="submit"]')!;
    expect(submitButton).toBeDisabled();
  });

  it("submit button enables when text is entered", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    await user.type(textarea, "Hello");

    const submitButton = textarea
      .closest("form")!
      .querySelector('button[type="submit"]')!;
    expect(submitButton).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Helpers for chat tests
// ---------------------------------------------------------------------------

/** Render app, wait for ready state, type a message and submit it. */
async function renderAndSendMessage(text = "Hello agent") {
  const user = userEvent.setup();
  mockFetch();
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText("Agent Playground")).toBeInTheDocument();
  });

  const textarea = screen.getByPlaceholderText("Send a message...");
  await user.type(textarea, text);
  await user.click(
    textarea.closest("form")!.querySelector('button[type="submit"]')!,
  );

  // Wait for conversation creation + EventSource to be set up
  await waitFor(() => {
    expect(MockEventSource.latest).not.toBeNull();
  });

  return { user, es: MockEventSource.latest! };
}

// ---------------------------------------------------------------------------
// Config view content
// ---------------------------------------------------------------------------
describe("Config view content", () => {
  it("renders system prompt and tool info from fetched config", async () => {
    const user = userEvent.setup();
    mockFetch({
      config: {
        systemPrompt: "You are a helpful assistant.",
        tools: [
          { name: "search", title: "Search", description: "Search the web", type: "other" },
          { name: "calc", title: "Calculator", description: "Do math", type: "other" },
        ],
      },
    });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Config"));

    await waitFor(() => {
      expect(screen.getByText("System Prompt")).toBeInTheDocument();
    });

    expect(screen.getByText("You are a helpful assistant.")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Search the web")).toBeInTheDocument();
    expect(screen.getByText("Calculator")).toBeInTheDocument();
    expect(screen.getByText("Do math")).toBeInTheDocument();
    expect(screen.getByText("2 tools")).toBeInTheDocument();
  });

  it("shows fallback when config fetch fails", async () => {
    const user = userEvent.setup();
    mockFetch({ config: null });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Config"));

    await waitFor(() => {
      expect(screen.getByText("No configuration available")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Chat message sending
// ---------------------------------------------------------------------------
describe("Chat message sending", () => {
  it("sends correct API requests on submit", async () => {
    await renderAndSendMessage("Hello agent");

    const fetchMock = vi.mocked(globalThis.fetch);
    const calls = fetchMock.mock.calls;

    // Find the POST /api/conversations call
    const createCall = calls.find(
      ([url, init]) =>
        typeof url === "string" &&
        url.endsWith("/api/conversations") &&
        init?.method === "POST",
    );
    expect(createCall).toBeDefined();

    // Find the POST .../messages call and verify the body
    const msgCall = calls.find(
      ([url, init]) =>
        typeof url === "string" &&
        url.includes("/api/conversations/test-conv-123/messages") &&
        init?.method === "POST",
    );
    expect(msgCall).toBeDefined();
    const body = JSON.parse(msgCall![1]!.body as string);
    expect(body.content).toBe("Hello agent");
  });

  it("user message appears immediately and input clears", async () => {
    await renderAndSendMessage("Hello agent");

    // User message visible
    expect(screen.getByText("Hello agent")).toBeInTheDocument();

    // Input cleared
    const textarea = screen.getByPlaceholderText("Send a message...");
    expect(textarea).toHaveValue("");
  });

  it("submit button is disabled while waiting for response", async () => {
    await renderAndSendMessage("Hello agent");

    const textarea = screen.getByPlaceholderText("Send a message...");
    const submitButton = textarea
      .closest("form")!
      .querySelector('button[type="submit"]')!;
    expect(submitButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// SSE streaming events
// ---------------------------------------------------------------------------
describe("SSE streaming events", () => {
  it("chunk events append text to assistant message", async () => {
    const { es } = await renderAndSendMessage("Hi");

    act(() => {
      es.simulateEvent("chunk", { type: "chunk", content: "Hello " });
    });
    act(() => {
      es.simulateEvent("chunk", { type: "chunk", content: "world!" });
    });

    await waitFor(() => {
      expect(screen.getByText("Hello world!")).toBeInTheDocument();
    });
  });

  it("step-start and step-end render step indicators", async () => {
    const { es } = await renderAndSendMessage("Use a tool");

    act(() => {
      es.simulateEvent("step-start", {
        type: "step-start",
        step_id: "s1",
        name: "web_search",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("web_search")).toBeInTheDocument();
    });

    act(() => {
      es.simulateEvent("step-end", { type: "step-end", step_id: "s1" });
    });

    // Step is still visible (now with completed status — the Check icon is rendered)
    await waitFor(() => {
      expect(screen.getByText("web_search")).toBeInTheDocument();
    });
  });

  it("finish event stops streaming and re-enables input", async () => {
    const { es } = await renderAndSendMessage("Hi");

    act(() => {
      es.simulateEvent("chunk", { type: "chunk", content: "Done" });
    });
    act(() => {
      es.simulateEvent("finish", { type: "finish" });
    });

    await waitFor(() => {
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    // Textarea should be re-enabled
    const textarea = screen.getByPlaceholderText("Send a message...");
    expect(textarea).not.toBeDisabled();
  });

  it("error SSE event shows error text in assistant message", async () => {
    const { es } = await renderAndSendMessage("Hi");

    act(() => {
      es.simulateEvent("error", {
        type: "error",
        message: "Rate limit exceeded",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Error: Rate limit exceeded")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
describe("Keyboard shortcuts", () => {
  it("Enter submits the form", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    await user.type(textarea, "keyboard submit");
    await user.keyboard("{Enter}");

    // Message should appear
    await waitFor(() => {
      expect(screen.getByText("keyboard submit")).toBeInTheDocument();
    });
  });

  it("Shift+Enter does not submit", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    await user.type(textarea, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(textarea, "line two");

    // Text should still be in the textarea, not submitted
    expect(textarea).toHaveValue("line one\nline two");
    // No message in the chat
    expect(screen.queryByText("line one")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error states during messaging
// ---------------------------------------------------------------------------
describe("Error states during messaging", () => {
  it("conversation creation failure shows error and connection error screen", async () => {
    const user = userEvent.setup();
    mockFetch({ conversations: { ok: false } });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    await user.type(textarea, "Will fail");
    await user.click(
      textarea.closest("form")!.querySelector('button[type="submit"]')!,
    );

    // Should eventually show the connection error screen
    await waitFor(() => {
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
    });
  });

  it("message send failure shows error and connection error screen", async () => {
    const user = userEvent.setup();
    mockFetch({ messages: { ok: false } });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Send a message...");
    await user.type(textarea, "Will fail on send");
    await user.click(
      textarea.closest("form")!.querySelector('button[type="submit"]')!,
    );

    await waitFor(() => {
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Theme localStorage persistence
// ---------------------------------------------------------------------------
describe("Theme localStorage persistence", () => {
  it("toggling theme writes to localStorage", async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Agent Playground")).toBeInTheDocument();
    });

    const toggle = screen.getByTitle(/Switch to dark mode|Switch to light mode/);
    await user.click(toggle);

    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(toggle);

    expect(localStorage.getItem("theme")).toBe("light");
  });
});
