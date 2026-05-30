/**
 * Compare old and new ABI interfaces
 * @param {object} oldAbi - Old ABI definition
 * @param {object} newAbi - New ABI definition
 * @returns {object} Comparison result with removed, added, modified
 */
export function compareInterfaces(oldAbi, newAbi) {
  const oldFns = new Map((oldAbi.functions || []).map((f) => [f.name, f]));
  const newFns = new Map((newAbi.functions || []).map((f) => [f.name, f]));

  const removed = [];
  const added = [];
  const modified = [];

  oldFns.forEach((oldFn, name) => {
    if (!newFns.has(name)) {
      removed.push(oldFn);
    } else {
      const newFn = newFns.get(name);
      if (!signaturesEqual(oldFn, newFn)) {
        modified.push({ name, oldInputs: oldFn.inputs, newInputs: newFn.inputs });
      }
    }
  });

  newFns.forEach((newFn, name) => {
    if (!oldFns.has(name)) {
      added.push(newFn);
    }
  });

  return { removed, added, modified };
}

/**
 * Check if function signatures are equal
 * @param {object} fn1 - First function
 * @param {object} fn2 - Second function
 * @returns {boolean} True if signatures match
 */
function signaturesEqual(fn1, fn2) {
  const inputs1 = fn1.inputs || [];
  const inputs2 = fn2.inputs || [];

  if (inputs1.length !== inputs2.length) return false;

  return inputs1.every((inp, i) => inp.type === inputs2[i].type);
}

/**
 * Detect breaking changes from comparison
 * @param {object} comparison - Comparison result
 * @returns {array} Array of breaking changes
 */
export function detectBreakingChanges(comparison) {
  const breaking = [];

  comparison.removed.forEach((fn) => {
    breaking.push({
      type: "removed_function",
      name: fn.name,
      severity: "critical",
      message: `Function '${fn.name}' was removed`,
    });
  });

  comparison.modified.forEach((mod) => {
    breaking.push({
      type: "modified_signature",
      name: mod.name,
      severity: "high",
      message: `Function '${mod.name}' signature changed`,
      oldInputs: mod.oldInputs,
      newInputs: mod.newInputs,
    });
  });

  return breaking;
}

/**
 * Generate compatibility report
 * @param {object} comparison - Comparison result
 * @returns {object} Compatibility report
 */
export function generateCompatibilityReport(comparison) {
  const breakingChanges = detectBreakingChanges(comparison);
  const isCompatible = breakingChanges.length === 0;

  const totalChanges = comparison.removed.length + comparison.added.length + comparison.modified.length;
  const compatibilityScore = isCompatible ? 100 : Math.max(0, 100 - breakingChanges.length * 25);

  return {
    isCompatible,
    breakingChanges,
    removals: comparison.removed,
    additions: comparison.added,
    modifications: comparison.modified,
    summary: isCompatible ? "No breaking changes" : `${breakingChanges.length} breaking change${breakingChanges.length > 1 ? "s" : ""} detected`,
    compatibilityScore,
    totalChanges,
  };
}
