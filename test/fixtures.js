export const rel = (id, influence) => ({ id, influence: `${influence}` });
export const concept = (id, name, relationships = []) => ({ id, name, relationships });
