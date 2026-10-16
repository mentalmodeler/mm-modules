import {compareModels} from './src/compare';
import {loadFile, loadURL} from './src/loader';
import {parseMMP} from './src/parser';
import {runScenario, sigm, tanh} from './src/scenario';
import {getMetrics, getConceptsWithMetrics} from './src/metrics';
import {importCSV} from './src/csvImport';
import {makeId} from './src/id';
import {findRelationship, getMatrixRows, toCompareRefModel} from './src/export';

async function loadAndParse(file) {
    return parseMMP(await loadFile(file));
}

async function loadAndParseURL(url) {
    return parseMMP(await loadURL(url));
}

export {
    compareModels,
    findRelationship,
    getMatrixRows,
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
    toCompareRefModel,
};
