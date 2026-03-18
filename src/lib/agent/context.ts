import type Anthropic from "@anthropic-ai/sdk";

export interface AgentSession {
  messages: Anthropic.MessageParam[];
  currentProjectId: string | null;
  currentProjectName: string | null;
  sessionStart: Date;
}

export function createSession(): AgentSession {
  return {
    messages: [],
    currentProjectId: null,
    currentProjectName: null,
    sessionStart: new Date(),
  };
}

export function addUserMessage(session: AgentSession, content: string): void {
  session.messages.push({ role: "user", content });
}

export function addAssistantMessage(
  session: AgentSession,
  content: Anthropic.ContentBlock[]
): void {
  session.messages.push({ role: "assistant", content });
}

export function addToolResults(
  session: AgentSession,
  results: Anthropic.ToolResultBlockParam[]
): void {
  session.messages.push({ role: "user", content: results });
}

export function setProject(
  session: AgentSession,
  id: string,
  name: string
): void {
  session.currentProjectId = id;
  session.currentProjectName = name;
}

export function getMessages(session: AgentSession): Anthropic.MessageParam[] {
  return session.messages;
}

export function getMessageCount(session: AgentSession): number {
  return session.messages.length;
}
