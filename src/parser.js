const NESTED_LISTS = ['relationships', 'concepts', 'properties'];
const getChars = (length = 4) => Math.random().toString(16).slice(-(length - 15));
const makeId = () => `${getChars(8)}-${getChars()}-${getChars()}-${getChars()}-${getChars(12)}`

const replaceFuzzyInfluence = (influence) => {
    if (isNaN(parseFloat(influence))) {
        switch (influence) {
            case 'L+':
                return '.34';
            case 'M+':
                return '.67';
            case 'H+':
                return '1';
            case 'L-':
                return '-.34';
            case 'M-':
                return '-.67';
            case 'H-':
                return '-1';
            default:
                console.log('Error: replaceFuzzyInfluence, influence:', influence);
                return influence;
        }
    }
    return influence;
}

const parseMMP = (mmp) => {
    try {
        if (mmp.indexOf('<?xml') > -1) {
            return parseXML(mmp);
        }
        else {
            const js = JSON.parse(mmp);
            if (!js?.info?.id) {
                js.info.id = makeId();
            }
            return js;
        }
    }
    catch (e) {
        console.error(e);
        alert('Parsing of mmp failed!' + e);
    }
};

const parseXML = (xmlString, excludeArray = []) => {
    let json = {};
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    let childNodes = xmlDoc.firstChild.childNodes;

    childNodes.forEach((node) => {
        switch(node.localName) {
            case 'info':
                if (excludeArray.indexOf('info') === -1) {
                    json.info = getJSONFromNode(node);
                    if (!json.info.id) {
                        json.info.id = makeId();
                    }
                }
            break;
            case 'groupNames':
                if (excludeArray.indexOf('group') === -1) {
                    json.groupNames = getJSONFromNode(node, true);
                }
            break;
            case 'concepts':
                if (excludeArray.indexOf('concepts') === -1) {
                    json.concepts = getJSONFromArray(getChildNodes(node));
                }
            break;
            case 'scenarios':
                if (excludeArray.indexOf('scenario') === -1) {
                    json.scenarios = getJSONFromArray(getChildNodes(node));
                }
            break;
        }
    });
    console.log('JSON from XML:', json);
    return json;
};

const getJSONFromNode = (xmlNode, omitLocalNameProperty) => {
    let json = {};

    xmlNode.childNodes.forEach((node) => {
        if (node.nodeType === 1) {
            if (node.localName === 'groupName') {
                let idx = node.getAttribute('index');
                json[idx] = node.textContent;
            }
            
            if (NESTED_LISTS.indexOf(node.localName) > -1) {
                json[node.localName] = getJSONFromArray(getChildNodes(node));
            }
            else if (!omitLocalNameProperty) {
                const value = node.localName === 'influence'
                    ? replaceFuzzyInfluence(node.textContent)
                    : node.textContent
                json[node.localName] = value; // node.textContent
            }
        }
    });
    return json;
};

const getJSONFromArray = (xmlArray) => {
    let a = [];

    xmlArray.forEach((node) => {
        a.push(getJSONFromNode(node));
    });

    return a;
};

const getChildNodes = (xml) => {
    let nodes = [];

    xml.childNodes.forEach((node) => {
        if(node.nodeType === 1) {
            nodes.push(node);
        }
    });

    return nodes;
};

export {parseMMP};
