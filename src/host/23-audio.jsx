/*
 * Audio tools: fades and volume steps on the Audio Levels property.
 */
(function (M) {
    var u = M.u;

    function audioLayers(comp, ctx) {
        var layers = u.selectedLayers(comp, 1);
        var out = [];
        var i, levels;
        for (i = 0; i < layers.length; i++) {
            levels = u.isAV(layers[i]) && layers[i].hasAudio ? levelsOf(layers[i]) : null;
            if (!levels) {
                ctx.warn(layers[i].name + ": has no audio, skipped.");
            } else if (layers[i].locked) {
                ctx.warn(layers[i].name + ": locked, skipped.");
            } else if (levels.expressionEnabled) {
                ctx.warn(layers[i].name + ": Audio Levels has an expression, skipped.");
            } else {
                out.push({ layer: layers[i], levels: levels });
            }
        }
        if (!out.length && layers.length) {
            throw u.userError("Select at least one layer with audio.", "selection");
        }
        return out;
    }

    function levelsOf(layer) {
        var grp = layer.property(u.MATCH.audio);
        return grp ? grp.property(u.MATCH.audioLevels) : null;
    }

    function addDb(value, db) {
        return [value[0] + db, value[1] + db];
    }

    /**
     * mode: "in" | "out" | "both"; seconds: fade length; floorDb: level treated as
     * silence. Fades are clamped to half the layer for "both" so they never cross.
     */
    M.register("audio.fade", {
        undo: function (args) {
            return args.mode === "in" ? "Fade In Audio" : (args.mode === "out" ? "Fade Out Audio" : "Fade Audio");
        },
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var targets = audioLayers(comp, ctx);
            var seconds = Math.max(0, args.seconds || 0.5);
            var floor = typeof args.floorDb === "number" ? args.floorDb : -48;
            var doIn = args.mode === "in" || args.mode === "both";
            var doOut = args.mode === "out" || args.mode === "both";
            var i, levels, layer, len, maxLen, tIn, tOut, t1, t0, v1, v0;

            for (i = 0; i < targets.length; i++) {
                layer = targets[i].layer;
                levels = targets[i].levels;
                tIn = layer.inPoint;
                tOut = layer.outPoint;
                maxLen = (tOut - tIn) / (doIn && doOut ? 2 : 1);
                len = Math.min(seconds, maxLen);
                // Read both target levels before adding any key so the fades don't see each other.
                t1 = tIn + len;
                t0 = tOut - len;
                v1 = levels.valueAtTime(t1, true);
                v0 = levels.valueAtTime(t0, true);
                if (doIn) {
                    levels.setValueAtTime(t1, v1);
                    levels.setValueAtTime(tIn, [floor, floor]);
                }
                if (doOut) {
                    levels.setValueAtTime(t0, v0);
                    levels.setValueAtTime(tOut, [floor, floor]);
                }
            }
            return { layers: targets.length, seconds: seconds };
        }
    });

    /** Shifts Audio Levels by `db`, every existing keyframe included. */
    M.register("audio.volume", {
        undo: function (args) {
            return args.db >= 0 ? "Volume Up" : "Volume Down";
        },
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var targets = audioLayers(comp, ctx);
            var db = Number(args.db) || 0;
            var keys = 0;
            var i, k, levels;
            for (i = 0; i < targets.length; i++) {
                levels = targets[i].levels;
                if (levels.numKeys > 0) {
                    for (k = 1; k <= levels.numKeys; k++) {
                        levels.setValueAtKey(k, addDb(levels.keyValue(k), db));
                        keys++;
                    }
                } else {
                    levels.setValue(addDb(levels.value, db));
                }
            }
            return { layers: targets.length, keys: keys, db: db };
        }
    });
})(MES);
