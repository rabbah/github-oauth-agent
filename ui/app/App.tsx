import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ArrowUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  Check,
  AlertCircle,
  Copy,
  CheckCheck,
  MessageSquare,
  Settings2,
  FileText,
  Sun,
  Moon,
  Mic,
  Square,
} from "lucide-react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  useReactFlow,
  Position,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import astroLogo from "./astro-logo.svg";
import astroLogoDark from "./astro-logo-dark.svg";
import playgroundIllustration from "./playground-empty-state.svg";
import playgroundIllustrationDark from "./playground-empty-state-dark.svg";
import { useAudio } from "./hooks/useAudio";

// Runtime config from window.__ENV__ (injected by nginx) or Vite env or default
declare global {
  interface Window {
    __ENV__?: {
      API_URL?: string;
    };
  }
}

// Use relative URLs by default (works with nginx proxy), allow override via env
const API_URL = window.__ENV__?.API_URL ?? import.meta.env.VITE_API_URL ?? "";

type ToolConfig = {
  name: string;
  title: string;
  description: string;
  type: "graph" | "other";
  graph?: {
    nodes: { id: string; name: string; type: string }[];
    edges: { id: string; source: string; target: string }[];
  };
};

type AgentConfig = {
  systemPrompt: string;
  tools: ToolConfig[];
};

type ViewMode = "chat" | "config";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
  reasoning?: string;
  isStreaming?: boolean;
  inputModality?: "text" | "audio";
};

type Step = {
  id: string;
  name: string;
  type: "tool";
  status: "running" | "completed";
};

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Custom code block theme based on oneDark but tweaked for our design
const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
    padding: 0,
    fontSize: "0.85em",
    lineHeight: 1.6,
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: "transparent",
    fontSize: "inherit",
  },
};

// Custom pre component to avoid double-wrapping code blocks
function Pre({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function CodeBlock({
  children,
  className,
  ...props
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeString = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Inline code (no language specified, single line)
  if (!match) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // If the language is markdown/md and the content contains code fences,
  // render it as actual markdown instead of as a code block.
  if ((language === "md" || language === "markdown") && /^```\w*$/m.test(codeString)) {
    return (
      <div className="nested-markdown-content">
        <Markdown
          components={{
            pre: Pre,
            code: CodeBlock,
          }}
        >
          {codeString}
        </Markdown>
      </div>
    );
  }

  // Code block with syntax highlighting
  return (
    <div className="code-block-wrapper group relative">
      <div className="code-block-header flex items-center justify-between px-4 py-2 bg-card border-b border-border rounded-t-lg">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckCheck className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={codeTheme}
        language={language}
        PreTag="div"
        className="code-block-content !bg-background !rounded-t-none !rounded-b-lg !m-0 !p-4"
        showLineNumbers={codeString.split("\n").length > 3}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          color: "var(--muted-foreground)",
          opacity: 0.5,
          userSelect: "none",
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}

function ViewToggle({
  viewMode,
  onToggle,
}: {
  viewMode: ViewMode;
  onToggle: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center bg-muted rounded-md p-1 border border-border">
      <button
        onClick={() => onToggle("chat")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-all duration-200 ${viewMode === "chat"
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
          }`}
      >
        <MessageSquare className="w-4 h-4" />
        Chat
      </button>
      <button
        onClick={() => onToggle("config")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-all duration-200 ${viewMode === "config"
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
          }`}
      >
        <Settings2 className="w-4 h-4" />
        Config
      </button>
    </div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark")
  );

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function GraphNode({ data }: NodeProps) {
  const isStartOrEnd = data.isStart || data.isEnd;

  const targetPositionMap: Record<string, Position> = {
    left: Position.Left,
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
  };
  const sourcePositionMap: Record<string, Position> = {
    left: Position.Left,
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
  };

  const targetPosition = targetPositionMap[data.targetPosition as string] || Position.Left;
  const sourcePosition = sourcePositionMap[data.sourcePosition as string] || Position.Right;

  return (
    <div
      className={`text-xs text-center min-w-[120px] rounded-lg border px-4 py-2 ${
        isStartOrEnd
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-card-foreground border-border"
      }`}
    >
      <Handle type="target" position={targetPosition} />
      {typeof data.label === "string" ? data.label : JSON.stringify(data.label)}
      <Handle type="source" position={sourcePosition} />
    </div>
  );
}

const nodeTypes = { graphNode: GraphNode };

const NODE_WIDTH = 172;
const NODE_HEIGHT = 36;

function getLayoutedElements(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: "TB" | "LR" = "LR"
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === "LR";

  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        targetPosition: isHorizontal ? "left" : "top",
        sourcePosition: isHorizontal ? "right" : "bottom",
      },
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
}

function ToolGraphFlowInner({ tool }: { tool: ToolConfig }) {
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    if (!tool.graph) return { nodes: [], edges: [] };

    const nodesWithOutgoing = new Set(tool.graph.edges.map((e) => e.source));
    const terminalNodeIds = tool.graph.nodes
      .filter((node) => !nodesWithOutgoing.has(node.id))
      .map((node) => node.id);

    const flowNodes: FlowNode[] = tool.graph.nodes.map((node) => ({
      id: node.id,
      type: "graphNode",
      position: { x: 0, y: 0 },
      data: { label: node.name, isStart: node.type === "start" },
    }));

    const endNodeId = "__end__";
    flowNodes.push({
      id: endNodeId,
      type: "graphNode",
      position: { x: 0, y: 0 },
      data: { label: "End", isEnd: true },
    });

    const flowEdges: FlowEdge[] = tool.graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: true,
    }));

    terminalNodeIds.forEach((nodeId, index) => {
      flowEdges.push({
        id: `__end_edge_${index}`,
        source: nodeId,
        target: endNodeId,
        animated: true,
      });
    });

    return getLayoutedElements(flowNodes, flowEdges, "LR");
  }, [tool.graph]);

  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 200 });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      zoomOnPinch={true}
      zoomOnDoubleClick={false}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--muted-foreground)" gap={16} size={1} />
    </ReactFlow>
  );
}

function ToolGraphView({ tool }: { tool: ToolConfig }) {
  if (!tool.graph) return null;

  const nodeCount = tool.graph.nodes.length;
  const height = Math.max(200, Math.min(400, nodeCount * 30));

  return (
    <div
      className="w-full bg-background rounded-lg border border-border mt-3"
      style={{ height: `${height}px` }}
    >
      <ReactFlowProvider>
        <ToolGraphFlowInner tool={tool} />
      </ReactFlowProvider>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolConfig }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasGraph = tool.type === "graph" && tool.graph;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => hasGraph && setIsExpanded(!isExpanded)}
        className={`w-full flex items-start gap-3 p-3 text-left ${hasGraph ? "cursor-pointer hover:bg-muted" : "cursor-default"} transition-colors`}
        disabled={!hasGraph}
      >
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Wrench className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground">
            {tool.title}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {tool.description || "No description"}
          </p>
        </div>
        {hasGraph && (
          <div className="shrink-0 text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </button>
      {isExpanded && hasGraph && (
        <div className="px-3 pb-3">
          <ToolGraphView tool={tool} />
        </div>
      )}
    </div>
  );
}

function AgentConfigView({
  config,
  isLoading,
}: {
  config: AgentConfig | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        No configuration available
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* System Prompt Section */}
        <div className="bg-muted border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              System Prompt
            </h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {config.systemPrompt || "No system prompt configured"}
            </p>
          </div>
        </div>

        {/* Tools Section */}
        <div className="bg-muted border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
            <Wrench className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              Available Tools
            </h3>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
              {config.tools.length} tool{config.tools.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="p-4">
            {config.tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tools configured
              </p>
            ) : (
              <div className="space-y-3">
                {config.tools.map((tool, index) => (
                  <ToolCard key={index} tool={tool} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border border-border text-sm">
      {step.status === "running" ? (
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      ) : (
        <Check className="w-4 h-4 text-green-500" />
      )}
      <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-foreground/80">{step.name}</span>
    </div>
  );
}

function LiveReasoning({ reasoning, isStreaming }: { reasoning: string; isStreaming: boolean }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!isStreaming && reasoning) {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, reasoning]);

  if (!reasoning || !isVisible) return null;

  return (
    <div
      className={`mb-3 flex items-start gap-2 transition-opacity duration-500 ${isFadingOut ? "opacity-0" : "opacity-100"
        }`}
    >
      <Brain className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0 animate-pulse" />
      <p className="text-xs text-muted-foreground italic leading-relaxed">
        {reasoning}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3 bg-muted-foreground rounded-sm ml-1 animate-pulse opacity-50" />
        )}
      </p>
    </div>
  );
}

function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0ms", animationDuration: "600ms" }}
        />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "150ms", animationDuration: "600ms" }}
        />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "300ms", animationDuration: "600ms" }}
        />
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const hasContent = message.content && message.content.trim().length > 0;
  const hasSteps = message.steps && message.steps.length > 0;
  const isThinking = message.isStreaming && !hasContent;
  const allStepsCompleted = hasSteps && message.steps!.every((s) => s.status === "completed");
  const isProcessingToolResults = isThinking && allStepsCompleted;

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div className={`flex-1 max-w-[80%] ${isUser ? "flex flex-col items-end" : ""}`}>
        {message.reasoning && (
          <LiveReasoning
            reasoning={message.reasoning}
            isStreaming={message.isStreaming ?? false}
          />
        )}

        {hasSteps && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.steps!.map((step) => (
              <StepIndicator key={step.id} step={step} />
            ))}
          </div>
        )}

        {isThinking && !hasSteps && <ThinkingIndicator />}

        {isProcessingToolResults && <ThinkingIndicator label="Processing results" />}

        {hasContent && (
          <div
            className={`px-4 py-3 rounded-md ${isUser
              ? "bg-stone-200 dark:bg-stone-800 text-foreground"
              : "bg-card"
              }`}
          >
            {message.inputModality === "audio" && isUser && (message.content === "[Listening...]" || message.content === "[Voice message]") ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mic className="w-4 h-4" />
                <span>{message.content === "[Listening...]" ? "Listening..." : "Voice message"}</span>
              </div>
            ) : message.inputModality === "audio" && isUser ? (
              <div className="flex items-start gap-2">
                <Mic className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="markdown-content">
                  <Markdown>{message.content}</Markdown>
                </div>
              </div>
            ) : (
            <div className="markdown-content">
              <Markdown
                components={{
                  pre: Pre,
                  code: CodeBlock,
                  a: ({ children, href, ...props }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </Markdown>
            </div>
            )}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary rounded-sm ml-1 animate-pulse-soft" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="mb-6">
        <img src={playgroundIllustration} alt="" className="h-16 dark:hidden" />
        <img src={playgroundIllustrationDark} alt="" className="hidden h-16 dark:block" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">
        Agent Playground
      </h2>
      <p className="text-muted-foreground max-w-md">
        Test and interact with your AI agent. Send a message below to start a
        conversation.
      </p>
    </div>
  );
}

function ConnectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-20 h-20 rounded-2xl bg-destructive flex items-center justify-center mb-6 shadow-lg shadow-destructive/20">
        <AlertCircle className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">
        Connection Error
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        Unable to connect to the messaging service. Make sure astro-messaging is running with the web adapter enabled.
      </p>
      <code className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-mono text-foreground/80 mb-6">
        WEB_ENABLED=true astro-messaging
      </code>
      <button
        onClick={onRetry}
        className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
      >
        Retry Connection
      </button>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Conversation state for messaging API
  const [conversationId, setConversationId] = useState<string | null>(
    new URLSearchParams(window.location.search).get('conversation')
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const getPendingUserMsgIdRef = useRef<(() => string | null) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Focus textarea on load and when switching to chat view
  useEffect(() => {
    if (viewMode !== "config") {
      inputRef.current?.focus();
    }
  }, [viewMode]);

  // Health check for connection
  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) {
        setConnectionError(false);
        return true;
      }
      setConnectionError(true);
      return false;
    } catch {
      setConnectionError(true);
      return false;
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Fetch agent config for the Config tab
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/agent/config`);
        if (res.ok) {
          setAgentConfig(await res.json());
        }
      } catch {
        // Agent config endpoint not available
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Load conversation history when conversationId is pre-set from URL (e.g. after OAuth redirect)
  useEffect(() => {
    if (!conversationId) return;
    const params = new URLSearchParams(window.location.search);
    const isAuthRedirect = params.get('replay_last') === 'true';

    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_URL}/api/conversations/${conversationId}/history`);
        if (!res.ok) return;
        const data = await res.json();
        const loaded: Message[] = (data.messages ?? [])
          .filter((m: any) => m.content?.trim() && m.content !== '__auth_complete__' && m.message_id)
          .map((m: any) => ({
            id: m.message_id,
            role: m.user?.id === 'agent' ? 'assistant' : 'user' as 'user' | 'assistant',
            content: m.content,
          }));
        if (loaded.length > 0) setMessages(loaded);

        // After restoring history, re-send the last user message so the agent responds
        if (isAuthRedirect) {
          const lastUserMsg = [...loaded].reverse().find((m) => m.role === 'user');
          if (lastUserMsg) {
            const assistantMessageId = generateId();
            setMessages((prev) => [...prev, {
              id: assistantMessageId,
              role: 'assistant',
              content: '',
              steps: [],
              isStreaming: true,
            }]);
            setIsLoading(true);
            setupEventSource(conversationId, assistantMessageId);
            await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: lastUserMsg.content }),
            });
          }
        }
      } catch {
        // History unavailable, start fresh
      }
    };
    loadHistory();
  }, []);

  const createConversation = async (): Promise<string> => {
    const res = await fetch(`${API_URL}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw new Error("Failed to create conversation");
    }

    const data = await res.json();
    return data.conversation_id;
  };

  const setupEventSource = (convId: string, assistantMessageId: string) => {
    // Close existing EventSource if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`${API_URL}/api/conversations/${convId}/stream`);
    eventSourceRef.current = es;

    // Handle message events (both named and unnamed)
    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE Event received:', data.type, data);

        switch (data.type) {
          case "chunk":
            // Messaging format: {type: "chunk", content, chunk_type}
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + (data.content || "") }
                  : msg
              )
            );
            break;

          case "step-start":
            // Messaging format: {type: "step-start", step_id, name}
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                    ...msg,
                    steps: [
                      ...(msg.steps || []),
                      {
                        id: data.step_id,
                        name: data.name,
                        type: "tool" as const,
                        status: "running" as const
                      },
                    ],
                  }
                  : msg
              )
            );
            break;

          case "step-end":
            // Messaging format: {type: "step-end", step_id}
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                    ...msg,
                    steps: msg.steps?.map((s) =>
                      s.id === data.step_id
                        ? { ...s, status: "completed" as const }
                        : s
                    ),
                  }
                  : msg
              )
            );
            break;

          case "reasoning-delta":
            // Messaging format: {type: "reasoning-delta", content}
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                    ...msg,
                    reasoning: (msg.reasoning || "") + (data.content || ""),
                  }
                  : msg
              )
            );
            break;

          case "finish":
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              )
            );
            setIsLoading(false);
            break;

          case "error":
            // Messaging format: {type: "error", message, code}
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                    ...msg,
                    content: `Error: ${data.message || "Unknown error"}`,
                    isStreaming: false,
                  }
                  : msg
              )
            );
            setIsLoading(false);
            break;

          case "transcript": {
            // Agent transcribed the user's audio — update the placeholder message
            const userMsgId = data.message_id || getPendingUserMsgIdRef.current?.();
            if (userMsgId) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === userMsgId
                    ? { ...msg, content: data.text }
                    : msg
                )
              );
            }
            break;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    };

    // Listen to all event types
    es.addEventListener('chunk', handleEvent);
    es.addEventListener('step-start', handleEvent);
    es.addEventListener('step-end', handleEvent);
    es.addEventListener('reasoning-delta', handleEvent);
    es.addEventListener('finish', handleEvent);
    es.addEventListener('error', handleEvent);
    es.addEventListener('connected', handleEvent);
    es.addEventListener('transcript', handleEvent);
    es.onmessage = handleEvent; // Also handle unnamed events

    es.onerror = () => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
      setIsLoading(false);
    };
  };

  const {
    isListening,
    isRecording,
    recordingDuration,
    voiceMode,
    toggleListening,
    toggleVoiceMode,
    getPendingUserMsgId,
  } = useAudio({
    conversationId,
    setConversationId,
    createConversation,
    setupEventSource,
    setMessages,
    setIsLoading,
    isLoading,
    generateId,
    apiUrl: API_URL,
  });

  // Wire the getter ref so setupEventSource can access it
  getPendingUserMsgIdRef.current = getPendingUserMsgId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: input.trim(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      steps: [],
      reasoning: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Create conversation if needed
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation();
        setConversationId(convId);
      }

      // Setup SSE stream before sending message
      setupEventSource(convId, assistantMessageId);

      // Send the message
      const res = await fetch(`${API_URL}/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userMessage.content,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              isStreaming: false,
            }
            : msg
        )
      );
      setIsLoading(false);
      setConnectionError(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };


  if (connectionError) {
    return (
      <div className="h-full flex flex-col bg-background">
        <ConnectionError onRetry={checkConnection} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm relative z-10">
        <div className="max-w-3xl mx-auto grid grid-cols-3 items-center">
          <div className="flex items-center gap-3">
            <img src={astroLogo} alt="Astro" className="h-5 dark:hidden" />
            <img src={astroLogoDark} alt="Astro" className="hidden h-5 dark:block" />
          </div>
          <div className="flex items-center justify-center">
            <ViewToggle viewMode={viewMode} onToggle={setViewMode} />
          </div>
          <div className="flex items-center justify-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {viewMode === "config" ? (
        <AgentConfigView config={agentConfig} isLoading={isLoadingConfig} />
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className={`max-w-3xl mx-auto ${messages.length === 0 ? "h-full flex flex-col" : ""}`}>
              {messages.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 px-6 py-4 border-t border-border bg-card/50 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              <div className={`relative flex flex-col gap-1 p-2 bg-muted rounded-[20px] border transition-colors ${isRecording ? "border-red-500" : isListening ? "border-amber-500" : "border-border focus-within:border-primary"}`}>
                {(isListening || isRecording) ? (
                  <div className="flex items-center justify-center gap-3 px-3 py-2 min-h-[72px]">
                    {isRecording ? (
                      <>
                        <span className="recording-pulse w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-sm text-foreground">
                          Speaking{recordingDuration > 0 ? ` — ${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, "0")}` : "..."}
                        </span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-amber-500 animate-pulse" />
                        <span className="text-sm text-muted-foreground">Listening for speech...</span>
                      </>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message..."
                    rows={1}
                    className="w-full bg-transparent px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none outline-none text-sm min-h-[72px] max-h-[200px]"
                    style={{ height: "72px" }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "72px";
                      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                  />
                )}
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(isListening || isRecording) ? toggleListening : toggleListening}
                        disabled={!isListening && !isRecording && isLoading}
                        className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isRecording
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : isListening
                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                            : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        }`}
                        title={isRecording ? "Speech detected — click to stop" : isListening ? "Listening — click to stop" : "Start voice input"}
                      >
                        {isRecording ? <Square className="w-4 h-4" /> : <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleVoiceMode}
                        className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border text-[8px] font-bold flex items-center justify-center transition-colors ${
                          voiceMode === "continuous"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:border-primary"
                        }`}
                        title={voiceMode === "single" ? "Switch to continuous mode" : "Switch to single utterance mode"}
                      >
                        {voiceMode === "continuous" ? "\u221E" : "1"}
                      </button>
                    </div>
                    {!(isListening || isRecording) && (
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowUp className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                {isRecording ? (
                  <><span className="recording-pulse inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />Speaking{recordingDuration > 0 ? ` — ${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, "0")}` : "..."}</>
                ) : isListening ? (
                  `Listening for speech${voiceMode === "continuous" ? " (continuous)" : ""}...`
                ) : (
                  "Press Enter to send, Shift+Enter for new line"
                )}
              </p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
