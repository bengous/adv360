import { UsageError } from "../errors.ts";
import type { Edit } from "../model/edit.ts";
import {
  parseLayerName,
  parseMacroTokens,
  parseTapHoldMs,
} from "../model/txt/layout.ts";
import { parseLedColors } from "../model/txt/led-edit.ts";
import { parseIndicator } from "../model/txt/led.ts";
import { need } from "./flags.ts";
import type { Flags } from "./flags.ts";

function layer(flags: Flags) {
  return parseLayerName(need(flags, "layer"));
}

function setRemap(flags: Flags): Edit {
  const position = need(flags, "pos");
  const action = need(flags, "action");

  return {
    kind: "layout",
    edit: { op: "set-remap", layer: layer(flags), position, action },
  };
}

function setTapHold(flags: Flags): Edit {
  return {
    kind: "layout",
    edit: {
      op: "set-taphold",
      layer: layer(flags),
      position: need(flags, "pos"),
      tap: need(flags, "tap"),
      ms: parseTapHoldMs(need(flags, "ms")),
      hold: need(flags, "hold"),
    },
  };
}

function setMacro(flags: Flags): Edit {
  return {
    kind: "layout",
    edit: {
      op: "set-macro",
      layer: layer(flags),
      trigger: need(flags, "trigger"),
      cotrigger: flags.cotrigger ?? null,
      tokens: parseMacroTokens(need(flags, "tokens")),
    },
  };
}

// --pos removes a key line; --trigger (with --cotrigger) removes a macro.
function remove(flags: Flags): Edit {
  if (flags.pos !== undefined && flags.pos !== "") {
    return {
      kind: "layout",
      edit: { op: "remove", layer: layer(flags), position: flags.pos },
    };
  }

  return {
    kind: "layout",
    edit: {
      op: "remove-macro",
      layer: layer(flags),
      trigger: need(flags, "trigger"),
      cotrigger: flags.cotrigger ?? null,
    },
  };
}

function setLed(flags: Flags): Edit {
  const func = need(flags, "func").toLowerCase();

  return {
    kind: "led",
    edit: {
      op: "set-led",
      indicator: parseIndicator(need(flags, "indicator")),
      function: func,
      colors: parseLedColors(flags.rgb ?? [], func),
    },
  };
}

export function editFromFlags(op: string, flags: Flags): Edit {
  switch (op) {
    case "set-remap":
      return setRemap(flags);
    case "set-taphold":
      return setTapHold(flags);
    case "set-macro":
      return setMacro(flags);
    case "remove":
      return remove(flags);
    case "set-led":
      return setLed(flags);
    default:
      throw new UsageError(`unknown session verb: ${op}`);
  }
}
