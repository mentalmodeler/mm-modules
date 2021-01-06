import {loadMMP} from './src/loader';
import {parseXML} from './src/parser';

async function loadAndParse(file) {
    const mmp = await loadMMP(file);

    try {
        if(mmp.indexOf('<?xml') > -1) {
            return parseXML(mmp);
        }
        else {
            return JSON.parse(mmp);
        }
    }
    catch (e) {
        console.error('Parsing of MMP file failed!');
        alert('Parsing of MMP file failed!');
    }
}

export {loadMMP, parseXML, loadAndParse};
