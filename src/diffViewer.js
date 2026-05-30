/**
 * Generate diff between two code strings
 * @param {string} oldCode - Old code
 * @param {string} newCode - New code
 * @returns {array} Array of diff objects
 */
export function generateDiff(oldCode, newCode) {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const diff = [];

  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      diff.push({ type: "unchanged", content: oldLine, lineNum: i + 1 });
    } else {
      if (oldLine !== undefined) {
        diff.push({ type: "removed", content: oldLine, lineNum: i + 1 });
      }
      if (newLine !== undefined) {
        diff.push({ type: "added", content: newLine, lineNum: i + 1 });
      }
    }
  }

  return diff;
}

/**
 * Parse unified diff format
 * @param {string} diffText - Diff text
 * @returns {array} Parsed diff lines
 */
export function parseDiffLines(diffText) {
  const lines = diffText.split("\n");
  const result = [];

  lines.forEach((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) {
      return;
    }
    if (line.startsWith("@@")) {
      return;
    }

    if (line.startsWith("+")) {
      result.push({ type: "added", content: line.substring(1) });
    } else if (line.startsWith("-")) {
      result.push({ type: "removed", content: line.substring(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.substring(1) });
    } else if (line.length > 0) {
      result.push({ type: "context", content: line });
    }
  });

  return result;
}

/**
 * Format diff output
 * @param {array} diff - Diff array
 * @param {object} options - Formatting options
 * @returns {string} Formatted diff
 */
export function formatDiffOutput(diff, options = {}) {
  if (diff.length === 0) return "";

  let output = "";

  if (options.sideBySide) {
    output = formatSideBySide(diff);
  } else {
    output = formatUnified(diff);
  }

  return output;
}

/**
 * Format diff in unified style
 * @param {array} diff - Diff array
 * @returns {string} Formatted output
 */
function formatUnified(diff) {
  return diff
    .map((item, idx) => {
      const marker = item.type === "added" ? "+" : item.type === "removed" ? "-" : " ";
      const lineNum = item.lineNum || idx + 1;
      return `${marker} ${lineNum.toString().padStart(4)} | ${item.content}`;
    })
    .join("\n");
}

/**
 * Format diff in side-by-side style
 * @param {array} diff - Diff array
 * @returns {string} Formatted output
 */
function formatSideBySide(diff) {
  const lines = [];
  let oldIdx = 1;
  let newIdx = 1;

  diff.forEach((item) => {
    if (item.type === "removed") {
      lines.push(`${oldIdx.toString().padStart(4)} | ${item.content.padEnd(40)} | `);
      oldIdx++;
    } else if (item.type === "added") {
      lines.push(`     |${" ".repeat(40)} | ${newIdx.toString().padStart(4)} | ${item.content}`);
      newIdx++;
    } else {
      lines.push(`${oldIdx.toString().padStart(4)} | ${item.content.padEnd(40)} | ${newIdx.toString().padStart(4)} | ${item.content}`);
      oldIdx++;
      newIdx++;
    }
  });

  return lines.join("\n");
}
