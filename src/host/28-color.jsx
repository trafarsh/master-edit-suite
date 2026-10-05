/*
 * Balance brightness: measures each clip's average brightness and adds one
 * Exposure effect per clip that moves it toward a common target.
 *
 * Measuring samples the layer's source before its effects (sampleImage with
 * postEffect = false), and an existing balance effect is reused, so running it
 * twice gives the same result as running it once.
 */
(function (M) {
    var u = M.u;
    var EFFECT_NAME = "MES Balance";
    var SAMPLES = 5;

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    /** Target 1..10 on the panel -> average display luma 0.07..0.70. */
    function targetLuma(target) {
        return clamp(target, 1, 10) * 0.07;
    }

    /** Exposure stops that move `luma` to `target` (both display-referred, gamma 2.2). */
    function stopsFor(luma, target, strength, tame) {
        var stops;
        if (luma <= 0.001) {
            return 0;
        }
        stops = 2.2 * Math.log(target / luma) / Math.LN2 * strength;
        if (!tame && stops < 0) {
            stops = 0;
        }
        return clamp(stops, -4, 4);
    }

    function lumaOf(rgba) {
        return 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2];
    }

    /** Average luma of the layer's source over SAMPLES evenly spaced frames. */
    function measure(comp, layer, ctx) {
        var probe = u.addEffect(layer, "ADBE Color Control", ctx);
        var color = probe.property(1);
        var total = 0;
        var i, t, span;
        color.expression =
            "var w = thisLayer.width, h = thisLayer.height;\n" +
            "thisLayer.sampleImage([w / 2, h / 2], [w / 2, h / 2], false, time)";
        span = layer.outPoint - layer.inPoint;
        for (i = 0; i < SAMPLES; i++) {
            t = layer.inPoint + span * (i + 0.5) / SAMPLES;
            total += lumaOf(color.valueAtTime(u.snap(comp, t), false));
        }
        probe.remove();
        ctx.untrack(probe);
        return total / SAMPLES;
    }

    function findBalance(layer) {
        var parade = u.effects(layer);
        var i;
        for (i = 1; i <= parade.numProperties; i++) {
            if (parade.property(i).matchName === "ADBE Exposure2" && parade.property(i).name === EFFECT_NAME) {
                return parade.property(i);
            }
        }
        return null;
    }

    /** The Exposure effect's main exposure control (match name first, index as fallback). */
    function exposureControl(fx) {
        var candidates = ["ADBE Exposure2-0003", 3];
        var i, p;
        for (i = 0; i < candidates.length; i++) {
            try {
                p = fx.property(candidates[i]);
            } catch (e) {
                p = null;
            }
            if (p && p instanceof Property && typeof p.value === "number") {
                return p;
            }
        }
        throw u.userError("Could not find the Exposure control in this After Effects version. Please send Copy diagnostics.", "exposure_param");
    }

    /** Balances `layers`; returns one result per clip that was changed. Shared with Auto Edit. */
    function balanceLayers(comp, layers, args, ctx) {
        var target = targetLuma(args.target || 5);
        var strength = clamp(args.strength === undefined ? 1 : args.strength, 0, 1);
        var results = [];
        var i, layer, kind, luma, stops, fx;
        for (i = 0; i < layers.length; i++) {
            layer = layers[i];
            kind = u.layerKind(layer);
            if (kind !== "footage" && kind !== "still" && kind !== "precomp") {
                ctx.warn(layer.name + ": not a clip, skipped.");
                continue;
            }
            if (layer.locked) {
                ctx.warn(layer.name + ": locked, skipped.");
                continue;
            }
            ctx.setStep("Measure " + layer.name);
            luma = measure(comp, layer, ctx);
            stops = stopsFor(luma, target, strength, !!args.tameBright);
            ctx.setStep("Expose " + layer.name);
            fx = findBalance(layer);
            if (!fx) {
                fx = u.addEffect(layer, "ADBE Exposure2", ctx);
                fx.name = EFFECT_NAME;
                fx.moveTo(1);
            }
            exposureControl(fx).setValue(Math.round(stops * 100) / 100);
            results.push({ name: layer.name, luma: Math.round(luma * 1000) / 1000, stops: Math.round(stops * 100) / 100 });
        }
        return results;
    }

    M.color = { stopsFor: stopsFor, targetLuma: targetLuma, balanceLayers: balanceLayers };

    M.register("color.balance", {
        undo: "Balance Brightness",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var results = balanceLayers(comp, u.selectedLayers(comp, 1), args, ctx);
            if (!results.length) {
                throw u.userError("Select at least one unlocked clip.", "selection");
            }
            ctx.created = [];
            return { clips: results.length, results: results };
        }
    });
})(MES);
