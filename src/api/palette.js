const DEFAULT_PALETTE = [
    '#f68b24', 'steelblue', '#619F3A', '#dfecd7', '#e14594', '#7045af', '#2b3595',
];

let spinCounter = -1;

const chooseColor = (k = (++spinCounter), palette=DEFAULT_PALETTE) =>
    palette[k % palette.length];

export default {
    chooseColor,
    DEFAULT_PALETTE,
};