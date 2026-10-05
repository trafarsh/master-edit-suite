/*
 * Read-only snapshot of the project, active comp and selection. The panel polls
 * this because CEP gets no selection-change event from After Effects.
 */
(function (M) {
    var u = M.u;

    M.register("state.get", {
        fn: function () {
            var proj = app.project;
            var item = proj ? proj.activeItem : null;
            var comp = item && item instanceof CompItem ? item : null;
            var selection = [];
            var keys = { properties: 0, pairs: 0 };
            var sel, i, pairs;
            if (comp) {
                sel = comp.selectedLayers;
                for (i = 0; i < sel.length; i++) {
                    selection.push(u.layerInfo(sel[i]));
                }
                pairs = M.ease.selectedPairs(comp, null);
                keys.properties = pairs.length;
                for (i = 0; i < pairs.length; i++) {
                    keys.pairs += pairs[i].pairs.length;
                }
            }
            return {
                project: proj ? {
                    name: proj.file ? proj.file.displayName : "Untitled Project",
                    saved: !!proj.file,
                    numItems: proj.numItems
                } : null,
                comp: comp ? u.compInfo(comp) : null,
                selection: selection,
                keys: keys
            };
        }
    });
})(MES);
