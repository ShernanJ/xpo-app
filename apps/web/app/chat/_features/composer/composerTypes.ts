"use client";

export type ComposerCommandId = "thread";

export type ChatComposerMode =
  | {
      kind: "edit";
    }
  | {
      kind: "command";
      commandId: ComposerCommandId;
    }
  | null;

export interface SlashCommandDefinition {
  id: ComposerCommandId;
  command: "/thread";
  label: string;
  description: string;
}

export interface ComposerImageAttachment {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  objectUrl: string;
}

export type HeroQuickAction =
  | {
      kind: "prompt";
      label: string;
      prompt: string;
    }
  | {
      kind: "command";
      label: string;
      commandId: ComposerCommandId;
    }
  | {
      kind: "image";
      label: string;
    };
