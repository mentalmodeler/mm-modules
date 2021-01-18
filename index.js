import {compareModels} from './src/compare';
import {loadFile, loadURL} from './src/loader';
import {parseMMP} from './src/parser';

async function loadAndParse(file) {
    return parseMMP(await loadFile(file));
}

async function loadAndParseURL(url) {
    return parseMMP(await loadURL(url));
}

const makeId = () => `id-${Math.random().toString(16).slice(2)}`;

export {
    compareModels,
    loadFile, 
    loadURL, 
    loadAndParse, 
    loadAndParseURL, 
    makeId, 
    parseMMP
};
