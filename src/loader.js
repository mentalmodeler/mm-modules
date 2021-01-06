function loadMMP(file) {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onerror = () => {
            reader.abort();
            reject(new DOMException("MMP file loading failed!"));
        };

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.readAsText(file);
    });
}

export {loadMMP};
