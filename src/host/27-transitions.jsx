/*
 * One-click transitions. A transition is a recipe (JSON, see recipes/transitions)
 * describing layers centred on a time, each carrying keyframed built-in effects.
 * The same engine builds Auto Edit's transitions, so a recipe is written once.
 *
 * Recipe layer:
 *   { "type": "adjustment" | "solid", "name": "...", "color": [r,g,b], "blendMode": "ADD",
 *     "transform": { "<transform match name>": <param> },
 *     "effects": [ { "matchName": "ADBE Tile", "params": { "<index or match name>": <param> } } ] }
 * Param: a static value, or { "keys": [[u, value, ease?], ...], "rest": value }
 *        or { "expression": "..." }.
 * u runs 0..1 across the transition; u = 0.5 always lands exactly on the centre
 * frame. Values move away from "rest" in proportion to the intensity. Expressions
 * may use {start} {center} {end} {length} {intensity} {width} {height}.
 */
(function (M) {
    var u = M.u;
    var TAG = "mes:transition";
    var LABEL = 9;

    function token(s, vars) {
        var k;
        for (k in vars) {
            if (vars.hasOwnProperty(k)) {
                s = s.split("{" + k + "}").join(String(vars[k]));
            }
        }
        return s;
    }

    function scaleValue(v, rest, intensity) {
        var out, i;
        if (rest === undefined || rest === null || intensity === 1) {
            return v;
        }
        if (typeof v === "number") {
            return rest + (v - rest) * intensity;
        }
        out = [];
        for (i = 0; i < v.length; i++) {
            out.push((M.isArray(rest) ? rest[i] : rest) + (v[i] - (M.isArray(rest) ? rest[i] : rest)) * intensity);
        }
        return out;
    }

    function resolveValue(v, vars) {
        var out, i;
        if (typeof v === "string") {
            // "{width}*1.5" style tokens resolve to numbers.
            return eval(token(v, vars));
        }
        if (M.isArray(v)) {
            out = [];
            for (i = 0; i < v.length; i++) {
                out.push(resolveValue(v[i], vars));
            }
            return out;
        }
        return v;
    }

    function easeFor(name, dims) {
        var arr = [];
        var i, inf;
        inf = name === "linear" ? 16.67 : 75;
        for (i = 0; i < dims; i++) {
            arr.push(new KeyframeEase(0, inf));
        }
        return arr;
    }

    /**
     * Sets a recipe param on a property: static, keyframed or expression. A param
     * that does not fit its property is skipped with a warning, so a recipe being
     * tuned never breaks the whole transition.
     */
    function applyParam(prop, spec, t, ctx, where) {
        if (!prop || !(prop instanceof Property)) {
            ctx.warn(where + ": parameter not found, skipped (check the recipe).");
            return;
        }
        try {
            setParam(prop, spec, t);
        } catch (e) {
            ctx.warn(where + ": " + e.message + " (skipped, check the recipe).");
        }
    }

    function setParam(prop, spec, t) {
        var i, k, key, time, value, ease, dims, BEZ, HOLD, LIN;
        if (spec !== null && typeof spec === "object" && !M.isArray(spec)) {
            if (spec.expression) {
                prop.expression = token(spec.expression, t.vars);
                return;
            }
            if (spec.keys) {
                BEZ = KeyframeInterpolationType.BEZIER;
                HOLD = KeyframeInterpolationType.HOLD;
                LIN = KeyframeInterpolationType.LINEAR;
                for (i = 0; i < spec.keys.length; i++) {
                    key = spec.keys[i];
                    time = t.at(key[0]);
                    value = scaleValue(resolveValue(key[1], t.vars), resolveValue(spec.rest, t.vars), t.intensity);
                    k = prop.addKey(time);
                    prop.setValueAtKey(k, value);
                    ease = key[2] || spec.ease || "smooth";
                    if (ease === "hold") {
                        prop.setInterpolationTypeAtKey(k, HOLD, HOLD);
                    } else if (ease === "linear") {
                        prop.setInterpolationTypeAtKey(k, LIN, LIN);
                    } else {
                        dims = prop.keyInTemporalEase(k).length;
                        prop.setInterpolationTypeAtKey(k, BEZ, BEZ);
                        prop.setTemporalEaseAtKey(k, easeFor(ease, dims), easeFor(ease, dims));
                    }
                }
                return;
            }
        }
        prop.setValue(resolveValue(spec, t.vars));
    }

    function effectParam(fx, key) {
        var n = Number(key);
        try {
            return isNaN(n) ? fx.property(key) : fx.property(n);
        } catch (e) {
            return null;
        }
    }

    /**
     * Builds one recipe centred on `center` (seconds). Returns the created layers,
     * top first. opts: lengthFrames, intensity, above (layer to sit above), tag,
     * prefix, label, span ([start, end] instead of a length around the centre),
     * only ("adjustment" or "solid" to build just those layers of the recipe).
     */
    function build(comp, recipe, center, opts, ctx) {
        var fd = comp.frameDuration;
        var frames = Math.max(2, Math.round(opts.lengthFrames || recipe.lengthFrames || 8));
        var c = u.snap(comp, center);
        var start = c - Math.floor(frames / 2) * fd;
        var end = start + frames * fd;
        if (opts.span) {
            start = opts.span[0];
            end = opts.span[1];
            c = u.snap(comp, (start + end) / 2);
        }
        var t = {
            intensity: opts.intensity === undefined ? 1 : opts.intensity,
            at: function (x) {
                var m;
                // "c-1" / "c+2": whole frames from the centre, for jump cuts.
                if (typeof x === "string") {
                    m = /^c([+-]\d+)?$/.exec(x);
                    return c + (m && m[1] ? Number(m[1]) * fd : 0);
                }
                return x <= 0.5 ? start + (x / 0.5) * (c - start) : c + ((x - 0.5) / 0.5) * (end - c);
            },
            vars: {}
        };
        var made = [];
        var anchor = opts.above || null;
        var outerStep = ctx.step;
        var i, j, spec, layer, tr, k, fxSpec, fx, p;
        t.vars = {
            start: start,
            center: c,
            end: end,
            length: end - start,
            intensity: t.intensity,
            width: comp.width,
            height: comp.height
        };

        if (start < 0 || end > comp.duration + fd / 2) {
            ctx.warn(recipe.name + ": runs past the comp edge; the outside part is cut off.");
        }
        for (i = recipe.layers.length - 1; i >= 0; i--) {
            spec = recipe.layers[i];
            if (opts.only && (spec.type === "solid" ? "solid" : "adjustment") !== opts.only) {
                continue;
            }
            ctx.setStep((outerStep ? outerStep + " › " : "") + recipe.name + " · " + (spec.name || spec.type));
            layer = ctx.track(comp.layers.addSolid(spec.color || [1, 1, 1], (opts.prefix || "TR") + " · " + (spec.name || recipe.name), comp.width, comp.height, comp.pixelAspect, comp.duration));
            layer.adjustmentLayer = spec.type !== "solid";
            layer.startTime = 0;
            layer.inPoint = Math.max(0, start);
            layer.outPoint = Math.min(comp.duration, end);
            layer.label = opts.label || LABEL;
            layer.comment = (opts.tag || TAG) + ":" + recipe.id;
            if (spec.blendMode && BlendingMode[spec.blendMode] !== undefined) {
                layer.blendingMode = BlendingMode[spec.blendMode];
            }
            // Built bottom-up, each layer directly above the previous: recipe layer 0 ends on top.
            if (anchor) {
                layer.moveBefore(anchor);
            }
            anchor = layer;
            tr = layer.property(u.MATCH.transform);
            if (spec.transform) {
                for (k in spec.transform) {
                    if (spec.transform.hasOwnProperty(k)) {
                        applyParam(tr.property(k), spec.transform[k], t, ctx, recipe.name + " " + k);
                    }
                }
            }
            for (j = 0; spec.effects && j < spec.effects.length; j++) {
                fxSpec = spec.effects[j];
                fx = u.addEffect(layer, fxSpec.matchName, null);
                for (k in fxSpec.params) {
                    if (fxSpec.params.hasOwnProperty(k)) {
                        p = effectParam(fx, k);
                        applyParam(p, fxSpec.params[k], t, ctx, recipe.name + " " + fxSpec.matchName + " #" + k);
                    }
                }
            }
            made.unshift(layer);
        }
        ctx.setStep(outerStep);
        return made;
    }

    function topLayerAt(comp, time) {
        var i, l;
        for (i = 1; i <= comp.numLayers; i++) {
            l = comp.layer(i);
            if (l.enabled && l.inPoint <= time && l.outPoint > time && u.isAV(l) && l.hasVideo && !l.adjustmentLayer) {
                return l;
            }
        }
        return null;
    }

    M.transitions = { build: build };

    M.register("transitions.apply", {
        undo: function (args) {
            return "Transition: " + (args.recipe && args.recipe.name ? args.recipe.name : "Apply");
        },
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var recipe = args.recipe;
            var layers;
            if (!recipe || !recipe.layers || !recipe.layers.length) {
                throw u.userError("This transition recipe has no layers.", "bad_recipe");
            }
            if (!topLayerAt(comp, comp.time)) {
                ctx.warn("No visible footage under the playhead; the transition may show nothing.");
            }
            layers = build(comp, recipe, comp.time, {
                lengthFrames: args.lengthFrames,
                intensity: args.intensity
            }, ctx);
            ctx.created = [];
            return { layers: layers.length, center: u.snap(comp, comp.time) };
        }
    });
})(MES);
