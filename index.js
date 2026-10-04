import {compareModels} from './src/compare';
import {loadFile, loadURL} from './src/loader';
import {parseMMP} from './src/parser';
import {runScenario, sigm, tanh} from './src/scenario';
import {getMetrics, getConceptsWithMetrics} from './src/metrics';
import {importCSV} from './src/csvImport';

async function loadAndParse(file) {
    return parseMMP(await loadFile(file));
}

async function loadAndParseURL(url) {
    return parseMMP(await loadURL(url));
}

const getChars = (length = 4) => Math.random().toString(16).slice(-(length - 15));
const makeId = (prefix = '') => `${prefix}${getChars(8)}-${getChars()}-${getChars()}-${getChars()}-${getChars(12)}`
// const makeId = () => `id-${Math.random().toString(16).slice(2)}`;

export {
    compareModels,
    loadFile, 
    loadURL, 
    loadAndParse, 
    loadAndParseURL, 
    makeId, 
    parseMMP,
    runScenario,
    sigm,
    tanh,
    getMetrics,
    getConceptsWithMetrics,
    importCSV,
};
