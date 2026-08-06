function splitLines(text) {
  if (text === undefined) {
    return [];
  }
  const withoutFinalNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
  return withoutFinalNewline === "" ? [] : withoutFinalNewline.split("\n");
}

function renderRange(start, lines) {
  return `${start},${lines.length}`;
}

function renderPlanDiff({ fileName, newText, oldText }) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const oldPath = oldText === undefined ? "/dev/null" : `a/${fileName}`;
  const newPath = newText === undefined ? "/dev/null" : `b/${fileName}`;
  const oldStart = oldLines.length === 0 ? 0 : 1;
  const newStart = newLines.length === 0 ? 0 : 1;
  const body = [
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ];

  return [
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    `@@ -${renderRange(oldStart, oldLines)} +${renderRange(newStart, newLines)} @@`,
    ...body,
    "",
  ].join("\n");
}

function renderPlanDiffs(changes) {
  return changes.map(renderPlanDiff).join("\n");
}

module.exports = { renderPlanDiffs };
