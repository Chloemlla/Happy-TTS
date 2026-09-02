import type { IEcoEnchantsOpsCommandPolicy } from "../models/ecoEnchantsModel";
import { EcoEnchantsServiceError } from "./ecoEnchantsService";

const MANAGED_PARAM_KEYS = new Set(["commandId", "arguments"]);
const DECLARABLE_ARGUMENT_TYPES = new Set(["string", "integer", "number", "boolean", "array"]);
// Argument values are substituted into a single Minecraft console command line, so the
// charset must exclude whitespace and separators: without that an argument can append a
// second token (or a second command) to the template the operator actually approved.
const ARGUMENT_VALUE_PATTERN = /^[A-Za-z0-9_.:@-]{1,200}$/;
const TEMPLATE_PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g;
const MAX_CONSOLE_TEMPLATE_LENGTH = 500;
const MAX_ARGUMENT_ARRAY_ITEMS = 50;

export const MANAGED_COMMAND_TIMEOUT_BOUNDS = { min: 1, max: 300, fallback: 10 } as const;
export const MANAGED_COMMAND_OUTPUT_BOUNDS = { min: 1024, max: 1024 * 1024, fallback: 64 * 1024 } as const;

export interface ManagedCommandResolution {
  params: Record<string, unknown>;
  timeoutSeconds: number;
  maxOutputBytes: number;
}

function policyError(message: string): EcoEnchantsServiceError {
  return new EcoEnchantsServiceError(422, "policy_rejected", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function clampInt(value: unknown, bounds: { min: number; max: number; fallback: number }): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

/**
 * A policy whose argument schema is not a closed object schema cannot constrain anything,
 * so it is rejected instead of silently accepting every argument.
 */
export function assertClosedArgumentSchema(schema: unknown): {
  properties: Record<string, unknown>;
  required: string[];
} {
  if (!isPlainObject(schema)) throw policyError("argumentSchema must be an object schema.");
  if (schema.type !== undefined && schema.type !== "object") throw policyError('argumentSchema.type must be "object".');
  if (!isPlainObject(schema.properties)) {
    throw policyError("argumentSchema.properties must declare every allowed argument.");
  }
  const properties = schema.properties;
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (!isPlainObject(fieldSchema)) throw policyError(`argumentSchema.properties.${field} must be an object.`);
    const fieldType = fieldSchema.type;
    if (typeof fieldType !== "string" || !DECLARABLE_ARGUMENT_TYPES.has(fieldType)) {
      throw policyError(
        `argumentSchema.properties.${field}.type must be one of ${[...DECLARABLE_ARGUMENT_TYPES].join(", ")}.`,
      );
    }
  }
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const field of required) {
    if (!(field in properties)) throw policyError(`argumentSchema.required lists undeclared argument ${field}.`);
  }
  return { properties, required };
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * The template itself is written by an ops admin, so it may use normal Minecraft command
 * syntax; what it must never carry is a control character that could split one console line
 * into two. Placeholders may only reference declared arguments.
 */
export function assertConsoleTemplate(template: string, properties: Record<string, unknown>): void {
  if (!template || template.length > MAX_CONSOLE_TEMPLATE_LENGTH || hasControlCharacter(template)) {
    throw policyError("minecraftConsoleTemplate contains characters that a managed console command may not carry.");
  }
  for (const match of template.matchAll(TEMPLATE_PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (!(name in properties)) throw policyError(`minecraftConsoleTemplate references undeclared argument ${name}.`);
  }
}

function assertPrimitiveArgument(field: string, value: unknown): void {
  if (typeof value === "string") {
    if (!ARGUMENT_VALUE_PATTERN.test(value)) throw policyError(`Command argument ${field} contains unsupported characters.`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw policyError(`Command argument ${field} must be a finite number.`);
    return;
  }
  if (typeof value !== "boolean") throw policyError(`Command argument ${field} must be a string, number or boolean.`);
}

function assertArgumentValue(field: string, value: unknown, fieldSchema: Record<string, unknown>): void {
  const expectedType = fieldSchema.type;
  const typeOk =
    expectedType === "integer"
      ? typeof value === "number" && Number.isInteger(value)
      : expectedType === "number"
        ? typeof value === "number"
        : expectedType === "string"
          ? typeof value === "string"
          : expectedType === "boolean"
            ? typeof value === "boolean"
            : Array.isArray(value);
  if (!typeOk) throw policyError(`Command argument ${field} has an invalid type.`);

  if (Array.isArray(fieldSchema.enum) && !fieldSchema.enum.includes(value)) {
    throw policyError(`Command argument ${field} is not in the allowed set.`);
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARGUMENT_ARRAY_ITEMS) throw policyError(`Command argument ${field} has too many items.`);
    value.forEach((item, index) => assertPrimitiveArgument(`${field}[${index}]`, item));
    return;
  }
  assertPrimitiveArgument(field, value);
}

/**
 * G7-46: rebuild the job params from the policy instead of forwarding whatever the caller
 * sent. `commandId` and the rendered console command come from the stored policy, the
 * arguments are the schema-validated subset, and every other key is rejected — the plugin
 * therefore only ever receives a command line the backend policy authorized.
 */
export function resolveManagedCommandParams(
  policy: IEcoEnchantsOpsCommandPolicy,
  requestedParams: Record<string, unknown>,
): ManagedCommandResolution {
  for (const key of Object.keys(requestedParams)) {
    if (!MANAGED_PARAM_KEYS.has(key)) throw policyError(`Job parameter ${key} is not allowed for a managed command.`);
  }
  const requestedArguments = requestedParams.arguments === undefined ? {} : requestedParams.arguments;
  if (!isPlainObject(requestedArguments)) throw policyError("Command arguments must be an object.");

  const { properties, required } = assertClosedArgumentSchema(policy.argumentSchema);
  for (const field of required) {
    if (requestedArguments[field] === undefined) throw policyError(`Command argument ${field} is required.`);
  }

  const validated: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(requestedArguments)) {
    const fieldSchema = properties[field];
    if (!isPlainObject(fieldSchema)) throw policyError(`Command argument ${field} is not allowed by the command policy.`);
    assertArgumentValue(field, value, fieldSchema);
    validated[field] = value;
  }

  const template = typeof policy.minecraftConsoleTemplate === "string" ? policy.minecraftConsoleTemplate.trim() : "";
  assertConsoleTemplate(template, properties);
  const consoleCommand = template
    .replace(TEMPLATE_PLACEHOLDER_PATTERN, (_match, name: string) => {
      const value = validated[name];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
      throw policyError(`Command template placeholder ${name} has no usable argument value.`);
    })
    .trim();
  if (!consoleCommand) throw policyError("minecraftConsoleTemplate rendered an empty console command.");

  const timeoutSeconds = clampInt(policy.timeoutSeconds, MANAGED_COMMAND_TIMEOUT_BOUNDS);
  const maxOutputBytes = clampInt(policy.maxOutputBytes, MANAGED_COMMAND_OUTPUT_BOUNDS);
  return {
    params: { commandId: policy.commandId, arguments: validated, consoleCommand, timeoutSeconds, maxOutputBytes },
    timeoutSeconds,
    maxOutputBytes,
  };
}
