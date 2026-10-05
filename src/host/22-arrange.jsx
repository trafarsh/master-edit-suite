/*
 * Arrange tools. Every action works on the current selection and is one undo step.
 */
(function (M) {
    var u = M.u;

    function unlockedOnly(layers, ctx) {
        return u.filter(layers, function (layer) {
            if (layer.locked) {
                ctx.warn(layer.name + ": locked, skipped.");
                return false;
            }
            return true;
        });
    }

    // --- Move to playhead ----------------------------------------------------

    M.register("arrange.moveToPlayhead", {
        undo: "Move to Playhead",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = unlockedOnly(u.selectedLayers(comp, 1), ctx);
            var earliest = Infinity;
            var delta, i;
            for (i = 0; i < layers.length; i++) {
                earliest = Math.min(earliest, layers[i].inPoint);
            }
            if (!layers.length) {
                return { moved: 0, delta: 0 };
            }
            delta = comp.time - earliest;
            for (i = 0; i < layers.length; i++) {
                layers[i].startTime += delta;
            }
            return { moved: layers.length, delta: delta };
        }
    });

    // --- Staircase -----------------------------------------------------------

    /** Sequences layers end to start in selection order; the first one stays put. */
    M.register("arrange.staircase", {
        undo: "Staircase Layers",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = unlockedOnly(u.selectedLayers(comp, 2), ctx);
            var overlap = u.frames(comp, Math.max(0, args.overlapFrames || 0));
            var i, prevOut, delta;
            if (layers.length < 2) {
                throw u.userError("Select at least 2 unlocked layers.", "selection");
            }
            prevOut = layers[0].outPoint;
            for (i = 1; i < layers.length; i++) {
                delta = (prevOut - overlap) - layers[i].inPoint;
                layers[i].startTime += delta;
                prevOut = layers[i].outPoint;
            }
            return { arranged: layers.length };
        }
    });

    // --- Pre-compose each ----------------------------------------------------

    /**
     * Puts one layer into its own precomp trimmed to the layer's length, with its
     * effects and keyframes moved inside. Returns the new precomp layer in `comp`.
     * Shared with Auto Edit step 1.
     */
    function precomposeLayer(comp, layer) {
        var index = layer.index;
        var inP = layer.inPoint;
        var outP = layer.outPoint;
        var dur = outP - inP;
        var label = layer.label;
        var name = layer.name;
        var newComp, inner, pl;

        newComp = comp.layers.precompose([index], name + " precomp", true);
        inner = newComp.layer(1);
        inner.startTime = inner.startTime - inP;
        newComp.duration = dur;
        pl = comp.layer(index);
        pl.startTime = inP;
        pl.inPoint = inP;
        pl.outPoint = outP;
        pl.label = label;
        return pl;
    }

    M.register("arrange.precomposeEach", {
        undo: "Pre-compose Each",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = unlockedOnly(u.selectedLayers(comp, 1), ctx);
            var targets = [];
            var done = 0;
            var i, kind;
            for (i = 0; i < layers.length; i++) {
                kind = u.layerKind(layers[i]);
                if (kind === "precomp" && !args.includePrecomps) {
                    ctx.warn(layers[i].name + ": already a precomp, skipped.");
                } else if (kind === "camera" || kind === "light") {
                    ctx.warn(layers[i].name + ": cameras and lights cannot be pre-composed.");
                } else {
                    targets.push(layers[i]);
                }
            }
            for (i = 0; i < targets.length; i++) {
                ctx.setStep("Pre-compose " + targets[i].name);
                if (hasChildren(comp, targets[i])) {
                    ctx.warn(targets[i].name + ": its child layers lost their parent.");
                }
                precomposeLayer(comp, targets[i]);
                done++;
            }
            return { precomposed: done };
        }
    });

    function hasChildren(comp, layer) {
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).parent === layer) {
                return true;
            }
        }
        return false;
    }

    // --- Un-precompose -------------------------------------------------------

    function isIdentityTransform(layer, inner, outer) {
        var tr = layer.property(u.MATCH.transform);
        var a = tr.property(u.MATCH.anchor).value;
        var p = tr.property(u.MATCH.position).value;
        var s = tr.property(u.MATCH.scale).value;
        var r = tr.property(u.MATCH.rotation).value;
        var eps = 0.001;
        if (tr.property(u.MATCH.position).dimensionsSeparated) {
            return false;
        }
        return Math.abs(a[0] - inner.width / 2) < eps && Math.abs(a[1] - inner.height / 2) < eps &&
            Math.abs(p[0] - outer.width / 2) < eps && Math.abs(p[1] - outer.height / 2) < eps &&
            Math.abs(s[0] - 100) < eps && Math.abs(s[1] - 100) < eps && Math.abs(r) < eps &&
            inner.width === outer.width && inner.height === outer.height;
    }

    function transformIsKeyframed(layer) {
        var tr = layer.property(u.MATCH.transform);
        var i;
        for (i = 1; i <= tr.numProperties; i++) {
            if (tr.property(i).numKeys > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Moves a precomp's layers back into the parent comp with their timing. A
     * non-identity static transform is carried by a null the layers are parented
     * to; anything that cannot be carried over is reported. The original precomp
     * layer is switched off, never deleted.
     */
    M.register("arrange.unprecompose", {
        undo: "Un-precompose",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = unlockedOnly(u.selectedLayers(comp, 1), ctx);
            var done = 0;
            var i;
            for (i = 0; i < layers.length; i++) {
                if (u.layerKind(layers[i]) !== "precomp") {
                    ctx.warn(layers[i].name + ": not a precomp, skipped.");
                    continue;
                }
                ctx.setStep("Un-precompose " + layers[i].name);
                unprecompose(comp, layers[i], ctx);
                done++;
            }
            return { unprecomposed: done };
        }
    });

    function unprecompose(comp, pl, ctx) {
        var inner = pl.source;
        var n = inner.numLayers;
        var copies = [];
        var locked = [];
        var map = {};
        var offset = pl.startTime;
        var i, src, copy, parentCopy, holder, tr, htr, notes, fx;

        notes = [];
        if (pl.stretch !== 100) {
            notes.push("time stretch");
        }
        if (pl.timeRemapEnabled) {
            notes.push("time remapping");
        }
        fx = u.effects(pl);
        if (fx && fx.numProperties > 0) {
            notes.push("effects");
        }
        if (pl.property("ADBE Mask Parade") && pl.property("ADBE Mask Parade").numProperties > 0) {
            notes.push("masks");
        }
        if (transformIsKeyframed(pl)) {
            notes.push("keyframed transform");
        }
        if (pl.property(u.MATCH.transform).property(u.MATCH.opacity).value !== 100) {
            notes.push("opacity");
        }
        if (pl.threeDLayer) {
            notes.push("3D transform");
        }

        // copyToComp puts each copy at the top, so copy bottom-up to keep the order.
        for (i = n; i >= 1; i--) {
            src = inner.layer(i);
            src.copyToComp(comp);
            copy = comp.layer(1);
            ctx.track(copy);
            copies.unshift(copy);
        }
        for (i = 0; i < copies.length; i++) {
            map[i + 1] = copies[i];
        }
        for (i = 0; i < copies.length; i++) {
            copy = copies[i];
            // Copies keep the inner layer's lock, which would block retiming them.
            locked[i] = copy.locked;
            copy.locked = false;
            copy.moveBefore(pl);
            copy.startTime = copy.startTime + offset;
            if (copy.inPoint < pl.inPoint) {
                copy.inPoint = pl.inPoint;
            }
            if (copy.outPoint > pl.outPoint) {
                copy.outPoint = pl.outPoint;
            }
        }
        // Restore parenting inside the copied set without moving anything.
        for (i = 1; i <= n; i++) {
            src = inner.layer(i);
            if (src.parent) {
                parentCopy = map[src.parent.index];
                if (parentCopy) {
                    map[i].setParentWithJump(parentCopy);
                }
            }
        }
        if (!isIdentityTransform(pl, inner, comp)) {
            holder = comp.layers.addNull(pl.outPoint - pl.inPoint);
            ctx.track(holder);
            holder.name = pl.name + " transform";
            holder.startTime = 0;
            holder.inPoint = pl.inPoint;
            holder.outPoint = pl.outPoint;
            holder.moveBefore(copies[0]);
            tr = pl.property(u.MATCH.transform);
            htr = holder.property(u.MATCH.transform);
            if (!tr.property(u.MATCH.position).dimensionsSeparated) {
                // The null's own layer space is 100x100 px; its anchor maps the inner comp's origin.
                htr.property(u.MATCH.anchor).setValue([tr.property(u.MATCH.anchor).value[0], tr.property(u.MATCH.anchor).value[1]]);
                htr.property(u.MATCH.position).setValue([tr.property(u.MATCH.position).value[0], tr.property(u.MATCH.position).value[1]]);
            } else {
                notes.push("separated position");
            }
            htr.property(u.MATCH.scale).setValue([tr.property(u.MATCH.scale).value[0], tr.property(u.MATCH.scale).value[1]]);
            htr.property(u.MATCH.rotation).setValue(tr.property(u.MATCH.rotation).value);
            for (i = 0; i < copies.length; i++) {
                if (!copies[i].parent) {
                    copies[i].setParentWithJump(holder);
                }
            }
        }
        for (i = 0; i < copies.length; i++) {
            copies[i].locked = locked[i];
        }
        pl.enabled = false;
        if (pl.hasAudio) {
            pl.audioEnabled = false;
        }
        ctx.created = [];
        if (notes.length) {
            ctx.warn(pl.name + ": not carried over: " + notes.join(", ") + ".");
        }
        ctx.warn(pl.name + ": original precomp layer switched off, not deleted.");
    }

    // --- Duplicate comp (independent) ----------------------------------------

    /** Duplicates a comp and every nested precomp so edits never touch the original. */
    function duplicateTree(comp, memo, ctx, suffix) {
        var dup, i, layer, wasLocked;
        if (memo[comp.id]) {
            return memo[comp.id];
        }
        dup = comp.duplicate();
        ctx.track(dup);
        dup.name = comp.name + suffix;
        memo[comp.id] = dup;
        memo.count = (memo.count || 0) + 1;
        for (i = 1; i <= dup.numLayers; i++) {
            layer = dup.layer(i);
            if (u.layerKind(layer) === "precomp") {
                wasLocked = layer.locked;
                layer.locked = false;
                layer.replaceSource(duplicateTree(layer.source, memo, ctx, " copy"), false);
                layer.locked = wasLocked;
            }
        }
        return dup;
    }

    M.register("arrange.duplicateComp", {
        undo: "Duplicate Comp (Independent)",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var memo = {};
            var dup = duplicateTree(comp, memo, ctx, " (independent)");
            ctx.created = [];
            if (args.open !== false) {
                dup.openInViewer();
            }
            return { name: dup.name, id: dup.id, duplicated: memo.count };
        }
    });

    // --- Split text by word --------------------------------------------------

    function textDocProp(layer) {
        return layer.property(u.MATCH.text).property(u.MATCH.textDocument);
    }

    function setText(layer, s, justification) {
        var prop = textDocProp(layer);
        var doc = prop.value;
        doc.text = s;
        if (justification !== undefined) {
            doc.justification = justification;
        }
        prop.setValue(doc);
    }

    function splitWords(line) {
        var words = [];
        var re = /\S+/g;
        var m;
        while ((m = re.exec(line)) !== null) {
            words.push({ text: m[0], start: m.index });
        }
        return words;
    }

    /**
     * Turns one point-text layer into one layer per word. Each word layer is
     * left-justified and its anchor point shifted so the word sits exactly where it
     * was: line origins come from TextDocument.baselineLocs, offsets inside a line
     * from measuring left-justified prefixes on a temporary copy.
     */
    function splitTextLayer(comp, layer, ctx) {
        var prop = textDocProp(layer);
        var doc = prop.value;
        var t = comp.time;
        var LEFT = ParagraphJustification.LEFT_JUSTIFY;
        var lines, locs, probe, created, li, wi, words, w, rPrefix, rWord, dx, dy, wordLayer, anchor;

        if (prop.numKeys > 0 || prop.expressionEnabled) {
            ctx.warn(layer.name + ": source text is keyframed or has an expression, skipped.");
            return 0;
        }
        if (doc.boxText) {
            ctx.warn(layer.name + ": paragraph (box) text is not supported yet; convert it to point text first.");
            return 0;
        }
        if (layer.property(u.MATCH.text).property(u.MATCH.textAnimators).numProperties > 0) {
            ctx.warn(layer.name + ": has text animators, skipped.");
            return 0;
        }
        lines = String(doc.text).split(/\r\n|\r|\n|\u0003/);
        locs = doc.baselineLocs;

        probe = ctx.track(layer.duplicate());
        created = 0;
        for (li = 0; li < lines.length; li++) {
            words = splitWords(lines[li]);
            for (wi = 0; wi < words.length; wi++) {
                w = words[wi];
                setText(probe, lines[li].substring(0, w.start + w.text.length), LEFT);
                rPrefix = probe.sourceRectAtTime(t, false);
                setText(probe, w.text, LEFT);
                rWord = probe.sourceRectAtTime(t, false);
                dx = (locs && locs.length >= li * 4 + 2 ? locs[li * 4] : 0) + (rPrefix.left + rPrefix.width) - (rWord.left + rWord.width);
                dy = locs && locs.length >= li * 4 + 2 ? locs[li * 4 + 1] : 0;

                wordLayer = ctx.track(layer.duplicate());
                wordLayer.name = w.text;
                setText(wordLayer, w.text, LEFT);
                anchor = wordLayer.property(u.MATCH.transform).property(u.MATCH.anchor);
                u.offsetProperty(anchor, [-dx, -dy, 0]);
                created++;
            }
        }
        probe.remove();
        ctx.untrack(probe);
        layer.enabled = false;
        return created;
    }

    M.register("arrange.splitTextByWord", {
        undo: "Split Text by Word",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = unlockedOnly(u.selectedLayers(comp, 1), ctx);
            var total = 0;
            var i;
            for (i = 0; i < layers.length; i++) {
                if (u.layerKind(layers[i]) !== "text") {
                    ctx.warn(layers[i].name + ": not a text layer, skipped.");
                    continue;
                }
                ctx.setStep("Split " + layers[i].name);
                total += splitTextLayer(comp, layers[i], ctx);
                // This layer is complete; a failure on a later one must not remove its words.
                ctx.created = [];
            }
            if (total > 0) {
                ctx.warn("Original text layers were switched off, not deleted.");
            }
            return { words: total };
        }
    });

    M.arrange = { precomposeLayer: precomposeLayer };
})(MES);
