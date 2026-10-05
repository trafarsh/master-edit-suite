/*
 * Cuts: scene edit detection (After Effects 22.3+) on one footage clip. Times
 * come back from AVLayer.doSceneEditDetection; it fails on time-remapped layers,
 * so those are refused up front.
 */
(function (M) {
    var u = M.u;

    function oneClip(comp) {
        var layers = u.selectedLayers(comp, 1);
        var layer;
        if (layers.length !== 1) {
            throw u.userError("Select exactly one footage clip.", "selection");
        }
        layer = layers[0];
        if (u.layerKind(layer) !== "footage") {
            throw u.userError(layer.name + " is not a footage clip.", "selection");
        }
        if (layer.timeRemapEnabled) {
            throw u.userError("Scene detection does not work on time-remapped layers. Turn time remapping off first.", "time_remap");
        }
        if (layer.locked) {
            throw u.userError(layer.name + " is locked.", "locked");
        }
        if (typeof layer.doSceneEditDetection !== "function") {
            throw u.userError("Scene edit detection needs After Effects 22.3 or later.", "unsupported");
        }
        return layer;
    }

    /** Detected cut times strictly inside the layer, frame-snapped and de-duplicated. */
    function cutTimes(comp, layer, raw) {
        var out = [];
        var i, t;
        var fd = comp.frameDuration;
        for (i = 0; i < raw.length; i++) {
            t = u.snap(comp, raw[i]);
            if (t > layer.inPoint + fd / 2 && t < layer.outPoint - fd / 2 && (!out.length || t - out[out.length - 1] > fd / 2)) {
                out.push(t);
            }
        }
        out.sort(function (a, b) {
            return a - b;
        });
        return out;
    }

    M.cuts = { cutTimes: cutTimes };

    M.register("cuts.detect", {
        undo: "Detect Cuts",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layer = oneClip(comp);
            ctx.setStep("Scene edit detection");
            var times = cutTimes(comp, layer, layer.doSceneEditDetection(SceneEditDetectionMode.MARKERS));
            return { cuts: times.length, times: times };
        }
    });

    M.register("cuts.split", {
        undo: "Split at Cuts",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layer = oneClip(comp);
            var before = comp.numLayers;
            ctx.setStep("Scene edit detection");
            layer.doSceneEditDetection(SceneEditDetectionMode.SPLIT);
            return { shots: comp.numLayers - before + 1 };
        }
    });

    /** One adjustment layer spanning each shot, directly above the clip, for per-shot grading. */
    M.register("cuts.adjustmentPerCut", {
        undo: "Adjustment Layer per Cut",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layer = oneClip(comp);
            var times, bounds, i, adj;
            ctx.setStep("Scene edit detection");
            times = cutTimes(comp, layer, layer.doSceneEditDetection(SceneEditDetectionMode.NONE));
            bounds = [layer.inPoint].concat(times).concat([layer.outPoint]);
            ctx.setStep("Add adjustment layers");
            for (i = bounds.length - 2; i >= 0; i--) {
                adj = ctx.track(comp.layers.addSolid([1, 1, 1], "Shot " + (i + 1) + " grade", comp.width, comp.height, comp.pixelAspect, comp.duration));
                adj.adjustmentLayer = true;
                adj.startTime = 0;
                adj.inPoint = bounds[i];
                adj.outPoint = bounds[i + 1];
                adj.label = 5;
                adj.comment = "mes:shot-grade";
                adj.moveBefore(layer);
            }
            ctx.created = [];
            return { shots: bounds.length - 1, cuts: times.length };
        }
    });
})(MES);
