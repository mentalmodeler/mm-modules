// Builds `length` lowercase hex characters. (Math.random().toString(16) yields a variable
// number of digits, so keep appending until there are enough.)
const hex = (length) => {
    let chars = '';
    while (chars.length < length) {
        chars += Math.random().toString(16).slice(2);
    }
    return chars.slice(0, length);
};

export const makeId = (prefix = '') => `${prefix}${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
