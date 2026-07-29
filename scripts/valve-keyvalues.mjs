// Minimal Valve KeyValues 1 parser for the decompiled Dota constants used by
// the live-client audit. Repeated keys follow Valve's override behavior here:
// the final value wins.
export function parseValveKeyValues(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ");
  const tokens = [];
  const tokenPattern = /"((?:\\.|[^"\\])*)"|([{}])|([^\s{}"]+)/g;
  let match;

  while ((match = tokenPattern.exec(withoutComments))) {
    tokens.push(match[1] !== undefined ? match[1].replace(/\\"/g, '"') : (match[2] ?? match[3]));
  }

  let cursor = 0;

  function parseObject() {
    const output = {};

    while (cursor < tokens.length && tokens[cursor] !== "}") {
      const key = tokens[cursor++];
      if (key.startsWith("[")) continue;

      let value;
      if (tokens[cursor] === "{") {
        cursor += 1;
        value = parseObject();
      } else {
        value = tokens[cursor++];
      }

      while (tokens[cursor]?.startsWith("[")) cursor += 1;
      output[key] = value;
    }

    if (tokens[cursor] === "}") cursor += 1;
    return output;
  }

  return parseObject();
}
