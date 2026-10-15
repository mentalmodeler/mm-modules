// Influences are strings in .mmp files ('0.5', '-1', sometimes '' for a connection with no
// value) but can be numbers (importCSV). Anything that does math or sign checks on an
// influence goes through this so strings, numbers and blanks all behave the same way.
export const toInfluence = (influence) => {
    const parsed = parseFloat(influence);
    return Number.isFinite(parsed) ? parsed : 0;
};
