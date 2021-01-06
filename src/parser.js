const NESTED_LISTS = ['relationships', 'concepts', 'properties'];

function parseXML(xmlString, excludeArray = []) {
    let json = {};
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    let childNodes = xmlDoc.firstChild.childNodes;

    childNodes.forEach((node) => {
        switch(node.localName) {
            case 'info':
                if (excludeArray.indexOf('info') === -1) {
                    json.info = getJSONFromNode(node);
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

    return json;
}

function getJSONFromNode(xmlNode, omitLocalNameProperty) {
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
                json[node.localName] = node.textContent;
            }
        }
    });
    return json;
}

function getJSONFromArray(xmlArray) {
    let a = [];

    xmlArray.forEach((node) => {
        a.push(getJSONFromNode(node));
    });

    return a;
}

function getChildNodes(xml) {
    let nodes = [];

    xml.childNodes.forEach((node) => {
        if(node.nodeType === 1) {
            nodes.push(node);
        }
    });

    return nodes;
}

export {parseXML};
