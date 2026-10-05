import type { ComponentType } from "react";
import type { IconName } from "../components/Icons";
import { Fx } from "./Fx";
import { General } from "./General";
import { AiTools, AutoEdit, Ease, Library, Transitions } from "./planned";
import { Project } from "./Project";
import { SettingsModule } from "./SettingsModule";

export interface ModuleDef {
  id: string;
  label: string;
  icon: IconName;
  component: ComponentType;
}

/** Sidebar order is fixed by the PRD. */
export const MODULES: ModuleDef[] = [
  { id: "autoedit", label: "Auto Edit", icon: "autoEdit", component: AutoEdit },
  { id: "library", label: "Library", icon: "library", component: Library },
  { id: "ai", label: "AI tools", icon: "ai", component: AiTools },
  { id: "transitions", label: "Transitions", icon: "transitions", component: Transitions },
  { id: "general", label: "General", icon: "general", component: General },
  { id: "ease", label: "Ease", icon: "ease", component: Ease },
  { id: "fx", label: "FX", icon: "fx", component: Fx },
  { id: "project", label: "Project", icon: "project", component: Project },
  { id: "settings", label: "Settings", icon: "settings", component: SettingsModule },
];

export function findModule(id: string): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[4];
}
