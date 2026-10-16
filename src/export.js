// Finds the relationship `influencer` has toward `influencee`, if any.
export const findRelationship = (influencer, influencee) => {
    const relationships = influencer?.relationships || [];
    return relationships.find(({ id }) => influencee.id === id);
};

// Square matrix of influences for CSV/XLS export: header row = blank corner + concept names, then one
// row per concept (name + its influence on every concept, '' where there is no relationship).
export const getMatrixRows = (concepts = []) => [
    ['', ...concepts.map(({ name }) => name)],
    ...concepts.map((concept) => [
        concept.name,
        ...concepts.map((_concept) => findRelationship(concept, _concept)?.influence ?? ''),
    ]),
];

// Canonical "answer key" export for mm-compare: strips x/y layout so a loaded file carries no visual
// map, and flags compareRef so an app's own load path can refuse to reopen it (loosely discourages
// students from viewing the answer). JSON only: the legacy XML `<compareref/>` writer is not ported.
export const toCompareRefModel = (model) => ({
    ...model,
    compareRef: true,
    concepts: (model?.concepts || []).map((concept) => {
        const stripped = { ...concept };
        delete stripped.x;
        delete stripped.y;
        return stripped;
    }),
});
