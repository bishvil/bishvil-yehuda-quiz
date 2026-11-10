// OpenMapTiles settlement classes/ranks work with OpenFreeMap and MapTiler.
export function isSettlementLayer(layer: {
  id: string;
  type: string;
  "source-layer"?: string;
}): boolean {
  return (
    layer.type === "symbol" &&
    (layer["source-layer"] === "place" ||
      /place|settlement|city|town|village/i.test(layer.id)) &&
    !/country|continent|state|province/i.test(layer.id)
  );
}
export function settlementFilter(level: string, original: unknown): unknown {
  const classes =
    level === "major"
      ? ["city"]
      : level === "medium"
        ? ["city", "town"]
        : [
            "city",
            "town",
            "village",
            "hamlet",
            "suburb",
            "neighbourhood",
            "isolated_dwelling",
          ];
  const filter: unknown[] = ["in", ["get", "class"], ["literal", classes]];
  const rank =
    level === "major" ? ["<=", ["coalesce", ["get", "rank"], 1], 4] : null;
  return [
    "all",
    ...(original ? [expressionFilter(original)] : []),
    filter,
    ...(rank ? [rank] : []),
  ];
}

function expressionFilter(filter: unknown): unknown {
  if (!Array.isArray(filter)) return filter;
  const [op, key, ...rest] = filter;
  if (["all", "any", "none"].includes(op)) {
    const children = filter.slice(1).map(expressionFilter);
    return op === "none" ? ["!", ["any", ...children]] : [op, ...children];
  }
  if (typeof key !== "string") return filter;
  const field = key === "$type" ? ["geometry-type"] : ["get", key];
  if (["==", "!=", ">", ">=", "<", "<="].includes(op))
    return [op, field, ...rest];
  if (op === "in" || op === "!in") {
    const test = ["in", field, ["literal", rest]];
    return op === "!in" ? ["!", test] : test;
  }
  if (op === "!has") return ["!", ["has", key]];
  return filter;
}
