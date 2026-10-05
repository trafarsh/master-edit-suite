/*
 * Ease curve editor: converts a cubic-bezier curve (x1, y1, x2, y2) to After
 * Effects' temporal ease (speed + influence) on every selected keyframe pair, and
 * back.
 *
 * For a segment of duration T and value change D, the average speed is S = D / T.
 * After Effects draws the outgoing handle of the first key at
 * (influence * T, speed * influence * T), so in normalised units
 *   x1 = outInfluence / 100,        y1 = outSpeed / S * x1
 *   x2 = 1 - inInfluence / 100,     y2 = 1 - inSpeed / S * (1 - x2)
 * Multi-dimensional, non-spatial properties (Scale) have one ease per dimension;
 * spatial properties (Position) have one ease measured along the path, for which
 * the straight-line distance is used.
 */
(function (M) {
    var u = M.u;

    var MIN_INFLUENCE = 0.1;

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    function isNumeric(v) {
        return typeof v === "number" || (M.isArray(v) && v.length > 0 && typeof v[0] === "number");
    }

    /** Average speed per ease dimension for the segment between keys a and b. */
    function averageSpeeds(prop, a, b, dims) {
        var t = prop.keyTime(b) - prop.keyTime(a);
        var va = prop.keyValue(a);
        var vb = prop.keyValue(b);
        var out = [];
        var i, sum;
        if (t <= 0) {
            t = 1;
        }
        if (typeof va === "number") {
            return [(vb - va) / t];
        }
        if (dims === 1) {
            sum = 0;
            for (i = 0; i < va.length; i++) {
                sum += (vb[i] - va[i]) * (vb[i] - va[i]);
            }
            return [Math.sqrt(sum) / t];
        }
        for (i = 0; i < dims; i++) {
            out.push((vb[i] - va[i]) / t);
        }
        return out;
    }

    /** Bezier + average speeds -> { out: [[speed, influence]...], inn: [...] } */
    function toEase(bez, speeds) {
        var x1 = clamp(bez[0], 0.001, 1);
        var x2 = clamp(bez[2], 0, 0.999);
        var outInf = clamp(x1 * 100, MIN_INFLUENCE, 100);
        var inInf = clamp((1 - x2) * 100, MIN_INFLUENCE, 100);
        var out = [];
        var inn = [];
        var i;
        for (i = 0; i < speeds.length; i++) {
            out.push([speeds[i] * (bez[1] / x1), outInf]);
            inn.push([speeds[i] * ((1 - bez[3]) / (1 - x2)), inInf]);
        }
        return { out: out, inn: inn };
    }

    /** Inverse of toEase for one dimension; null when the segment does not move. */
    function fromEase(outSpeed, outInf, inSpeed, inInf, avg) {
        var x1 = outInf / 100;
        var x2 = 1 - inInf / 100;
        if (Math.abs(avg) < 1e-9) {
            return null;
        }
        return [x1, (outSpeed / avg) * x1, x2, 1 - (inSpeed / avg) * (1 - x2)];
    }

    function easeArray(pairs) {
        var out = [];
        var i;
        for (i = 0; i < pairs.length; i++) {
            out.push(new KeyframeEase(pairs[i][0], pairs[i][1]));
        }
        return out;
    }

    /** Selected, keyframed, numeric properties of the active comp with their selected pairs. */
    function selectedPairs(comp, ctx) {
        var props = comp.selectedProperties;
        var out = [];
        var i, p, keys, pairs, j;
        for (i = 0; i < props.length; i++) {
            p = props[i];
            if (!(p instanceof Property) || !p.canVaryOverTime || p.numKeys < 2) {
                continue;
            }
            keys = [];
            for (j = 0; j < p.selectedKeys.length; j++) {
                keys.push(p.selectedKeys[j]);
            }
            keys.sort(function (a, b) {
                return a - b;
            });
            pairs = [];
            for (j = 0; j + 1 < keys.length; j++) {
                pairs.push([keys[j], keys[j + 1]]);
            }
            if (!pairs.length) {
                continue;
            }
            if (!isNumeric(p.keyValue(keys[0]))) {
                if (ctx) {
                    ctx.warn(p.name + ": only numeric properties can be eased here, skipped.");
                }
                continue;
            }
            out.push({ prop: p, pairs: pairs });
        }
        return out;
    }

    M.ease = {
        toEase: toEase,
        fromEase: fromEase,
        averageSpeeds: averageSpeeds,
        selectedPairs: selectedPairs
    };

    M.register("ease.read", {
        fn: function () {
            var comp = u.activeComp();
            var sel = selectedPairs(comp, null);
            var i, j, k, p, a, b, dims, speeds, outE, inE, curve, best;
            for (i = 0; i < sel.length; i++) {
                p = sel[i].prop;
                for (j = 0; j < sel[i].pairs.length; j++) {
                    a = sel[i].pairs[j][0];
                    b = sel[i].pairs[j][1];
                    outE = p.keyOutTemporalEase(a);
                    inE = p.keyInTemporalEase(b);
                    dims = outE.length;
                    speeds = averageSpeeds(p, a, b, dims);
                    // Read the dimension that moves the most; it defines the visible curve.
                    best = 0;
                    for (k = 1; k < speeds.length; k++) {
                        if (Math.abs(speeds[k]) > Math.abs(speeds[best])) {
                            best = k;
                        }
                    }
                    curve = fromEase(outE[best].speed, outE[best].influence, inE[best].speed, inE[best].influence, speeds[best]);
                    if (curve) {
                        return { curve: curve, property: p.name };
                    }
                }
            }
            throw u.userError("Select at least two keyframes that change value.", "selection");
        }
    });

    M.register("ease.apply", {
        undo: "Apply Ease",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var bez = args.curve;
            var sel = selectedPairs(comp, ctx);
            var BEZ = KeyframeInterpolationType.BEZIER;
            var HOLD = KeyframeInterpolationType.HOLD;
            var count = 0;
            var i, j, p, a, b, dims, ease, overshoot;
            if (!bez || bez.length !== 4) {
                throw u.userError("No curve to apply.", "bad_args");
            }
            overshoot = bez[1] < 0 || bez[1] > 1 || bez[3] < 0 || bez[3] > 1;
            if (!sel.length) {
                throw u.userError("Select at least two keyframes on a property.", "selection");
            }
            for (i = 0; i < sel.length; i++) {
                p = sel[i].prop;
                if (overshoot && p.isSpatial) {
                    ctx.warn(p.name + ": spatial properties cannot overshoot through ease alone; the curve is clipped there.");
                }
                for (j = 0; j < sel[i].pairs.length; j++) {
                    a = sel[i].pairs[j][0];
                    b = sel[i].pairs[j][1];
                    if (p.keyOutInterpolationType(a) === HOLD) {
                        continue;
                    }
                    dims = p.keyOutTemporalEase(a).length;
                    ease = toEase(bez, averageSpeeds(p, a, b, dims));
                    p.setInterpolationTypeAtKey(a, p.keyInInterpolationType(a), BEZ);
                    p.setInterpolationTypeAtKey(b, BEZ, p.keyOutInterpolationType(b));
                    p.setTemporalEaseAtKey(a, p.keyInTemporalEase(a), easeArray(ease.out));
                    p.setTemporalEaseAtKey(b, easeArray(ease.inn), p.keyOutTemporalEase(b));
                    count++;
                }
            }
            return { pairs: count, properties: sel.length };
        }
    });
})(MES);
