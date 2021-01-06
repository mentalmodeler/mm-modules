import {loadFile, loadURL} from './src/loader';
import {parseMMP} from './src/parser';

async function loadAndParse(file) {
    return parseMMP(await loadFile(file));
}

async function loadAndParseURL(url) {
    return parseMMP(await loadURL(url));
}

export {loadFile, loadURL, loadAndParse, loadAndParseURL, parseMMP};
