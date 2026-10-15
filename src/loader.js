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

const loadURL = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } catch (e) {
        throw new DOMException('MMP url loading failed!');
    }
};

export {loadFile, loadURL};
