/*
 * Auto Edit: turns the selected clips (the "edit part") into a styled edit in up
 * to six steps, all inside one undo group:
 *
 *   1 Pre-compose      each clip that is not a precomp, trimmed to its length
 *   2 Effects          per clip: velocity ramp, zooms, decaying shake
 *   3 Transition in    where the intro meets the edit part
 *   4 Cuts             one transition at each clip switch
 *   5 Additional       one effect over the whole edit part
 *   6 Coloring         optional Balance brightness, then a grade adjustment layer
 *
 * Generated layers sit directly above the topmost clip, bottom to top: CC,
 * additional effect, transitions, flash. Every generated layer carries
 * "autoedit:<runId>" in its comment, and every clip records the run in its
 * comment, so a re-run on the same clips replaces the earlier output.
 */
(function (M) {
    var u = M.u;
    var FX = { velocity: "MES Velocity", tile: "MES Motion Tile", motion: "MES Motion" };
    var LABEL = { cc: 13, extra: 10, transition: 9, flash: 2 };
    var PREFIX = { cc: "AE CC", extra: "AE FX", transition: "AE TR", flash: "AE FL" };
    var MIN_FRAMES = 6;
    var TAG_RE = /autoedit:([a-z0-9]+)(:clip)?/;

    var VELOCITY_EXPR =
        "// Auto Edit velocity: fast, slow, fast; keeps the clip's length.\n" +
        "var s = clamp(effect(\"" + FX.velocity + "\")(1), 0, 95) / 100;\n" +
        "var d = outPoint - inPoint;\n" +
        "var x = clamp((time - inPoint) / d, 0, 1);\n" +
        "var f = x + s * Math.sin(2 * Math.PI * x) / (2 * Math.PI);\n" +
        "inPoint - startTime + f * d";

    function runTag(comment) {
        var m = TAG_RE.exec(comment || "");
        return m ? { runId: m[1], clip: !!m[2] } : null;
    }

    function tagClip(layer, runId) {
        var c = String(layer.comment || "").replace(/\s*autoedit:[a-z0-9]+(:clip)?/g, "");
        layer.comment = (c ? c + "\n" : "") + "autoedit:" + runId + ":clip";
    }

    function newRunId() {
        return (new Date().getTime()).toString(36) + Math.floor(Math.random() * 1296).toString(36);
    }

    function isClip(layer) {
        var kind = u.layerKind(layer);
        return kind === "footage" || kind === "precomp" || kind === "still";
    }

    function ownsTimeRemap(layer) {
        var tr = layer.timeRemapEnabled ? layer.property(u.MATCH.timeRemap) : null;
        return !!(tr && tr.expression && tr.expression.indexOf(FX.velocity) >= 0);
    }

    /** The edit part: the given clip ids (or the selection), sorted by in point. */
    function resolveClips(comp, ids, ctx) {
        var out = [];
        var i, layer, list;
        if (ids && ids.length) {
            for (i = 0; i < ids.length; i++) {
                layer = u.findLayerById(comp, ids[i]);
                if (!layer) {
                    ctx.warn("A clip of the edit part no longer exists; select new clips.");
                } else {
                    out.push(layer);
                }
            }
        } else {
            list = comp.selectedLayers;
            for (i = 0; i < list.length; i++) {
                out.push(list[i]);
            }
        }
        out = u.filter(out, function (l) {
            if (!isClip(l)) {
                ctx.warn(l.name + ": not a video clip, left out.");
                return false;
            }
            if (l.locked) {
                ctx.warn(l.name + ": locked, skipped.");
                return false;
            }
            return true;
        });
        out.sort(function (a, b) {
            return a.inPoint - b.inPoint;
        });
        return out;
    }

    function describe(comp, clips) {
        var fd = comp.frameDuration;
        var start = Infinity;
        var end = -Infinity;
        var info = {
            clips: clips.length,
            start: 0,
            end: 0,
            switches: [],
            needPrecompose: 0,
            shortClips: [],
            stills: [],
            timeRemapped: [],
            overlaps: [],
            hasIntro: false
        };
        var i, l, j, other, ids;
        if (!clips.length) {
            return info;
        }
        ids = {};
        for (i = 0; i < clips.length; i++) {
            l = clips[i];
            ids[l.id] = true;
            start = Math.min(start, l.inPoint);
            end = Math.max(end, l.outPoint);
            if (i > 0) {
                info.switches.push(u.snap(comp, l.inPoint));
                if (l.inPoint < clips[i - 1].outPoint - fd / 2) {
                    info.overlaps.push(clips[i - 1].name + " / " + l.name);
                }
            }
            if (u.layerKind(l) !== "precomp") {
                info.needPrecompose++;
            }
            if (Math.round((l.outPoint - l.inPoint) / fd) < MIN_FRAMES) {
                info.shortClips.push(l.name);
            }
            if (u.layerKind(l) === "still") {
                info.stills.push(l.name);
            }
            if (l.timeRemapEnabled && !ownsTimeRemap(l)) {
                info.timeRemapped.push(l.name);
            }
        }
        info.start = start;
        info.end = end;
        for (j = 1; j <= comp.numLayers; j++) {
            other = comp.layer(j);
            if (!ids[other.id] && other.enabled && u.isAV(other) && other.hasVideo && !other.adjustmentLayer &&
                !runTag(other.comment) && other.inPoint < start - fd / 2 && other.outPoint > start - fd * 1.5) {
                info.hasIntro = true;
                break;
            }
        }
        return info;
    }

    /** Removes the output of earlier runs on these clips; returns the number of layers removed. */
    function removePrevious(comp, clips) {
        var runs = {};
        var removed = 0;
        var i, j, tag, parade, fx;
        for (i = 0; i < clips.length; i++) {
            tag = runTag(clips[i].comment);
            if (tag) {
                runs[tag.runId] = true;
            }
            parade = u.effects(clips[i]);
            for (j = parade.numProperties; j >= 1; j--) {
                fx = parade.property(j);
                if (fx.name === FX.velocity || fx.name === FX.tile || fx.name === FX.motion) {
                    fx.remove();
                }
            }
            if (ownsTimeRemap(clips[i])) {
                clips[i].property(u.MATCH.timeRemap).expression = "";
                clips[i].timeRemapEnabled = false;
            }
        }
        for (i = comp.numLayers; i >= 1; i--) {
            tag = runTag(comp.layer(i).comment);
            if (tag && !tag.clip && runs[tag.runId]) {
                comp.layer(i).locked = false;
                comp.layer(i).remove();
                removed++;
            }
        }
        return removed;
    }

    function smoothEase(prop, k) {
        var dims = prop.keyInTemporalEase(k).length;
        var e = [];
        var i;
        for (i = 0; i < dims; i++) {
            e.push(new KeyframeEase(0, 60));
        }
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(k, e, e);
    }

    /** Step 2 on one clip. Returns which effects were added. */
    function clipEffects(comp, clip, p, original, ctx) {
        var fd = comp.frameDuration;
        var frames = Math.round((clip.outPoint - clip.inPoint) / fd);
        var tooShort = frames < MIN_FRAMES;
        var did = { velocity: false, zoom: false, shake: false };
        var slider, motion, tile, scale, k, zoomEnd, blend;

        if (p.velocity && p.velocity.enabled) {
            if (tooShort) {
                ctx.warn(clip.name + ": shorter than " + MIN_FRAMES + " frames, no velocity.");
            } else if (original.still) {
                ctx.warn(clip.name + ": still image, no velocity.");
            } else if (original.remapped && !p.overwriteTimeRemap) {
                ctx.warn(clip.name + ": already time-remapped, velocity skipped (allow the overwrite to replace it).");
            } else {
                slider = u.addEffect(clip, "ADBE Slider Control", ctx);
                slider.name = FX.velocity;
                slider.property(1).setValue(Math.round((p.velocity.strength === undefined ? 0.5 : p.velocity.strength) * 100));
                clip.timeRemapEnabled = true;
                clip.property(u.MATCH.timeRemap).expression = VELOCITY_EXPR;
                // Undone on failure like a created item.
                ctx.track({
                    remove: function () {
                        clip.property(u.MATCH.timeRemap).expression = "";
                        clip.timeRemapEnabled = false;
                    }
                });
                blend = p.velocity.frameBlend;
                if (blend === "frameMix" || blend === "pixelMotion") {
                    clip.frameBlendingType = blend === "frameMix" ? FrameBlendingType.FRAME_MIX : FrameBlendingType.PIXEL_MOTION;
                    comp.frameBlending = true;
                }
                did.velocity = true;
            }
        }

        var wantZoom = p.zoom && p.zoom.enabled;
        var wantShake = p.shake && p.shake.enabled;
        if (wantZoom && tooShort) {
            ctx.warn(clip.name + ": shorter than " + MIN_FRAMES + " frames, no zooms.");
            wantZoom = false;
        }
        if (!wantZoom && !wantShake) {
            return did;
        }
        if (wantShake) {
            // Mirrored tiles fill whatever the shake uncovers, so no black borders appear.
            tile = u.addEffect(clip, "ADBE Tile", ctx);
            tile.name = FX.tile;
            tile.property(4).setValue(300);
            tile.property(5).setValue(300);
            tile.property(6).setValue(1);
        }
        motion = u.addEffect(clip, "ADBE Geometry2", ctx);
        motion.name = FX.motion;
        if (wantZoom) {
            scale = motion.property(4);
            zoomEnd = Math.min(clip.inPoint + Math.max(1, p.zoom.duration || 8) * fd, clip.outPoint - fd * 2);
            k = scale.addKey(clip.inPoint);
            scale.setValueAtKey(k, 100 + (p.zoom.amount === undefined ? 15 : p.zoom.amount));
            k = scale.addKey(zoomEnd);
            scale.setValueAtKey(k, 100);
            smoothEase(scale, k);
            k = scale.addKey(clip.outPoint - fd);
            scale.setValueAtKey(k, 100 + (p.zoom.push === undefined ? 4 : p.zoom.push));
            did.zoom = true;
        }
        if (wantShake) {
            motion.property(2).expression =
                "// Auto Edit shake: decays after the cut.\n" +
                "var d = time - inPoint;\n" +
                "d < 0 ? value : wiggle(" + (p.shake.frequency || 12) + ", " + (p.shake.amplitude || 25) + " * Math.exp(-" + (p.shake.decay || 6) + " * d))";
            did.shake = true;
        }
        return did;
    }

    function buildOpts(kind, runId, above, extra) {
        var o = { tag: "autoedit:" + runId, prefix: PREFIX[kind], label: LABEL[kind], above: above };
        var k;
        for (k in extra) {
            if (extra.hasOwnProperty(k)) {
                o[k] = extra[k];
            }
        }
        return o;
    }

    M.register("autoedit.inspect", {
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var clips = resolveClips(comp, args.clipIds, ctx);
            var info = describe(comp, clips);
            info.ids = u.map(clips, function (l) {
                return l.id;
            });
            info.names = u.map(clips, function (l) {
                return l.name;
            });
            info.notes = ctx.warnings;
            return info;
        }
    });

    M.register("autoedit.run", {
        undo: "Auto Edit",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var steps = args.steps || {};
            var runId = newRunId();
            var clips = resolveClips(comp, args.clipIds, ctx);
            var report = { runId: runId, clips: clips.length, removed: 0, precomposed: 0, velocity: 0, zoom: 0, shake: 0, transitionIn: false, cuts: 0, extra: false, cc: false, balanced: 0 };
            var info, originals, i, did, top, adjustmentPass, cutRecipe, fd;

            if (!clips.length) {
                throw u.userError("Select the clips of the edit part first.", "selection");
            }
            fd = comp.frameDuration;
            info = describe(comp, clips);
            if (info.overlaps.length) {
                ctx.warn("Overlapping clips (processed anyway): " + info.overlaps.join(", ") + ".");
            }

            ctx.setStep("Clear earlier output");
            report.removed = removePrevious(comp, clips);

            originals = [];
            for (i = 0; i < clips.length; i++) {
                originals.push({ still: u.layerKind(clips[i]) === "still", remapped: clips[i].timeRemapEnabled && !ownsTimeRemap(clips[i]) });
            }

            if (steps.precompose) {
                for (i = 0; i < clips.length; i++) {
                    if (u.layerKind(clips[i]) !== "precomp") {
                        ctx.setStep("Pre-compose " + clips[i].name);
                        clips[i] = M.arrange.precomposeLayer(comp, clips[i]);
                        report.precomposed++;
                    }
                }
            }
            for (i = 0; i < clips.length; i++) {
                tagClip(clips[i], runId);
            }

            if (steps.effects) {
                for (i = 0; i < clips.length; i++) {
                    ctx.setStep("Effects on " + clips[i].name);
                    did = clipEffects(comp, clips[i], args.effects || {}, originals[i], ctx);
                    report.velocity += did.velocity ? 1 : 0;
                    report.zoom += did.zoom ? 1 : 0;
                    report.shake += did.shake ? 1 : 0;
                }
            }

            top = clips[0];
            for (i = 1; i < clips.length; i++) {
                if (clips[i].index < top.index) {
                    top = clips[i];
                }
            }

            // Tiers are inserted directly above the topmost clip, top tier first, so
            // the final order bottom to top is CC, additional, transitions, flash.
            for (adjustmentPass = 0; adjustmentPass < 2; adjustmentPass++) {
                if (steps.transitionIn && args.transitionIn && args.transitionIn.recipe) {
                    if (!info.hasIntro) {
                        if (adjustmentPass === 0) {
                            ctx.warn("No intro before the edit part, so no transition into it.");
                        }
                    } else {
                        ctx.setStep("Transition into edit");
                        M.transitions.build(comp, args.transitionIn.recipe, info.start, buildOpts(adjustmentPass ? "transition" : "flash", runId, top, {
                            only: adjustmentPass ? "adjustment" : "solid",
                            intensity: args.transitionIn.strength,
                            lengthFrames: args.transitionIn.lengthFrames
                        }), ctx);
                        report.transitionIn = true;
                    }
                }
                if (steps.cuts && args.cuts && args.cuts.recipe) {
                    if (info.switches.length === 0) {
                        if (adjustmentPass === 0) {
                            ctx.warn("Only one clip, so there are no clip switches to transition.");
                        }
                    } else {
                        cutRecipe = args.cuts.recipe;
                        for (i = 0; i < info.switches.length; i++) {
                            ctx.setStep("Transition at switch " + (i + 1));
                            M.transitions.build(comp, cutRecipe, info.switches[i], buildOpts(adjustmentPass ? "transition" : "flash", runId, top, {
                                only: adjustmentPass ? "adjustment" : "solid",
                                intensity: args.cuts.intensity,
                                lengthFrames: args.cuts.duration
                            }), ctx);
                        }
                        report.cuts = info.switches.length;
                    }
                }
            }

            if (steps.extra && args.extra && args.extra.recipe) {
                ctx.setStep("Additional effect");
                M.transitions.build(comp, args.extra.recipe, info.start, buildOpts("extra", runId, top, {
                    span: [info.start, info.end],
                    intensity: args.extra.intensity
                }), ctx);
                report.extra = true;
            }

            if (steps.cc && args.cc) {
                if (args.cc.balance) {
                    ctx.setStep("Balance brightness");
                    report.balanced = M.color.balanceLayers(comp, clips, args.cc.balanceOptions || {}, ctx).length;
                }
                if (args.cc.recipe) {
                    ctx.setStep("Coloring");
                    M.transitions.build(comp, args.cc.recipe, info.start, buildOpts("cc", runId, top, {
                        span: [info.start, info.end],
                        intensity: 1
                    }), ctx);
                    report.cc = true;
                }
            }

            ctx.created = [];
            report.start = info.start;
            report.end = info.end;
            report.frames = Math.round((info.end - info.start) / fd);
            return report;
        }
    });

    M.autoedit = { describe: describe, VELOCITY_EXPR: VELOCITY_EXPR };
})(MES);
