import {compareModels} from './src/compare';
import {loadFile, loadURL} from './src/loader';
import {parseMMP} from './src/parser';
import {runScenario, sigm, tanh} from './src/scenario';
import {runInference} from './src/inference';
import {
    DEFAULT_SCENARIO_SETTINGS,
    INFERENCE_RULES,
    SQUASH_FUNCTIONS,
    normalizeScenarioSettings,
} from './src/scenarioSettings';
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
    DEFAULT_SCENARIO_SETTINGS,
    INFERENCE_RULES,
    SQUASH_FUNCTIONS,
    compareModels,
    findRelationship,
    getMatrixRows,
    loadFile, 
    loadURL, 
    loadAndParse, 
    loadAndParseURL, 
    makeId, 
    normalizeScenarioSettings,
    parseMMP,
    runInference,
    runScenario,
    sigm,
    tanh,
    getMetrics,
    getConceptsWithMetrics,
    importCSV,
    toCompareRefModel,
};
