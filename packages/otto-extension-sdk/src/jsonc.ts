const stripJsonComments = (source: string): string => {
  let result = "";
  let index = 0;
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        result += "\n";
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }

      if (current === "\n") {
        result += "\n";
      }

      index += 1;
      continue;
    }

    if (inString) {
      result += current;

      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (quote && current === quote) {
        inString = false;
        quote = null;
      }

      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
};

const stripTrailingCommas = (source: string): string => {
  let result = "";
  let index = 0;
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  while (index < source.length) {
    const current = source[index];

    if (inString) {
      result += current;

      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (quote && current === quote) {
        inString = false;
        quote = null;
      }

      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < source.length && /\s/.test(source[lookahead] ?? "")) {
        lookahead += 1;
      }

      const lookaheadChar = source[lookahead];
      if (lookaheadChar === "}" || lookaheadChar === "]") {
        index += 1;
        continue;
      }
    }

    result += current;
    index += 1;
  }

  return result;
};

export const parseJsonc = (source: string): unknown => {
  const withoutComments = stripJsonComments(source);
  const withoutTrailingCommas = stripTrailingCommas(withoutComments);
  return JSON.parse(withoutTrailingCommas);
};
