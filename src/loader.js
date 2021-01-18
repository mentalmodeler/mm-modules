const loadFile = (file) => {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onerror = () => {
            reader.abort();
            reject(new DOMException('MMP file loading failed!'));
        };

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.readAsText(file);
    });
};

const loadURL = (url) => {
    const req = new XMLHttpRequest();

    req.open('GET', url, true);
    req.responseType = 'text';
    
    return new Promise((resolve, reject) => {
        req.onerror = () => {
            req.abort();
            reject(new  DOMException('MMP url loading failed!'));
        };

        req.onload = () => {
            resolve(req.result);
        };

        req.send();
    });
};

export {loadFile, loadURL};
