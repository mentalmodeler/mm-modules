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
    return new Promise(async(resolve, reject) => {
        // fetch(url).then((response) => response.text().then((text) => resolve(text))).catch((err) => reject(new  DOMException('MMP url loading failed!')));
        try {
            const response = await fetch(url);
            const text = await response.text();
            resolve(text)

        } catch (e) {
            reject(new  DOMException('MMP url loading failed!'));
        }
    })
    
};

// const loadURL = async (url) => {
//     // const req = new XMLHttpRequest();
//     // req.open('GET', url, true);
//     // req.responseType = 'text';    
//     return new Promise((resolve, reject) => {
//         req.onerror = () => {
//             req.abort();
//             reject(new  DOMException('MMP url loading failed!'));
//         };
//         req.onload = () => {
//             console.log('req:', req);
//             resolve(req.result);
//         };
//         req.send();
//     });
// };

export {loadFile, loadURL};
