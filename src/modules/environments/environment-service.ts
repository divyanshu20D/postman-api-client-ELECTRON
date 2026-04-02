import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/connection';
import { appSettings, environments, variables } from '../../db/schema';
import type {
  CreateEnvironmentInput,
  SaveVariableInput,
  SetActiveEnvironmentInput,
  UpdateEnvironmentInput,
} from '../../shared/ipc';

const DEFAULT_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

function now() {
  return new Date().toISOString();
}

function getActiveWorkspaceId(): string | null {
  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  return settings?.activeWorkspaceId ?? null;
}

/* ===== Environments ===== */

export function listEnvironments() {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) return [];

  return db.select().from(environments).where(eq(environments.workspaceId, workspaceId)).all();
}

export function createEnvironment(input: CreateEnvironmentInput) {
  const timestamp = now();
  const id = randomUUID();

  db.insert(environments)
    .values({
      id,
      workspaceId: input.workspaceId,
      name: input.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return db.select().from(environments).where(eq(environments.id, id)).get()!;
}

export function updateEnvironment(input: UpdateEnvironmentInput) {
  db.update(environments)
    .set({ name: input.name, updatedAt: now() })
    .where(eq(environments.id, input.id))
    .run();

  return db.select().from(environments).where(eq(environments.id, input.id)).get()!;
}

export function deleteEnvironment(id: string) {
  // Delete all variables for this environment first
  db.delete(variables).where(eq(variables.environmentId, id)).run();
  db.delete(environments).where(eq(environments.id, id)).run();

  const settings = db.select().from(appSettings).where(eq(appSettings.id, DEFAULT_SETTINGS_ID)).get();
  if (settings?.activeEnvironmentId === id) {
    db.update(appSettings)
      .set({
        activeEnvironmentId: null,
        updatedAt: now(),
      })
      .where(eq(appSettings.id, DEFAULT_SETTINGS_ID))
      .run();
  }
}

export function setActiveEnvironment(input: SetActiveEnvironmentInput) {
  db.update(appSettings)
    .set({
      activeEnvironmentId: input.environmentId,
      updatedAt: now(),
    })
    .where(eq(appSettings.id, DEFAULT_SETTINGS_ID))
    .run();
}

/* ===== Variables ===== */

export function listVariables(environmentId: string) {
  return db.select().from(variables).where(eq(variables.environmentId, environmentId)).all();
}

export function saveVariable(input: SaveVariableInput) {
  const timestamp = now();
  const id = input.id ?? randomUUID();
  const existing = db.select().from(variables).where(eq(variables.id, id)).get();

  const payload = {
    id,
    environmentId: input.environmentId,
    workspaceId: input.workspaceId,
    scope: 'environment' as const,
    key: input.key,
    value: input.value ?? null,
    isSecret: input.isSecret,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    db.update(variables).set(payload).where(eq(variables.id, id)).run();
  } else {
    db.insert(variables).values(payload).run();
  }

  return db.select().from(variables).where(eq(variables.id, id)).get()!;
}

export function deleteVariable(id: string) {
  db.delete(variables).where(eq(variables.id, id)).run();
}
