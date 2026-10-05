/*
 * Project tools: export, sizing and keeping the project bin tidy.
 */
(function (M) {
    var u = M.u;

    // --- Export --------------------------------------------------------------

    function arrayHas(arr, v) {
        return u.indexOf(arr, v) >= 0;
    }

    /**
     * Renders the active comp through the render queue to `basePath` (no extension;
     * After Effects adds the one that matches the output module). Other queued items
     * are paused for the render and restored afterwards. The Node layer converts the
     * result to H.264 MP4 with ffmpeg.
     */
    M.register("project.render", {
        // No undo group: the render queue item is removed again once rendering ends.
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var rq = app.project.renderQueue;
            var paused = [];
            var item, om, i, other, outFile, template;

            ctx.setStep("Queue comp");
            for (i = 1; i <= rq.numItems; i++) {
                other = rq.item(i);
                if (other.status === RQItemStatus.QUEUED) {
                    other.render = false;
                    paused.push(other);
                }
            }
            item = rq.items.add(comp);
            om = item.outputModule(1);
            template = "(default)";
            if (args.template && arrayHas(om.templates, args.template)) {
                om.applyTemplate(args.template);
                template = args.template;
            } else if (args.template) {
                ctx.warn("Output module template \"" + args.template + "\" was not found; used the default.");
            }
            om.file = new File(args.basePath);

            ctx.setStep("Render");
            try {
                rq.render();
                outFile = om.file ? om.file.fsName : null;
            } finally {
                try {
                    item.remove();
                } catch (ignore) {
                    // A finished item can always be removed; ignore if AE disagrees.
                }
                for (i = 0; i < paused.length; i++) {
                    paused[i].render = true;
                }
            }
            return {
                file: outFile,
                template: template,
                comp: u.compInfo(comp)
            };
        }
    });

    M.register("project.saveFramePng", {
        fn: function (args) {
            var comp = u.activeComp();
            var file = new File(args.path);
            comp.saveFrameToPng(comp.time, file);
            return { file: file.fsName, time: comp.time };
        }
    });

    // --- Size ----------------------------------------------------------------

    M.register("project.resizeLayers", {
        undo: "Resize and Center",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = u.selectedLayers(comp, 1);
            var W = args.width || comp.width;
            var H = args.height || comp.height;
            var fill = args.mode === "fill";
            var done = 0;
            u.each(layers, function (layer) {
                var tr, rect, s, scale, anchor, cur, kind;
                kind = u.layerKind(layer);
                if (!u.isAV(layer) || kind === "null" || kind === "audio") {
                    ctx.warn(layer.name + ": no visible content, skipped.");
                    return;
                }
                if (layer.locked) {
                    ctx.warn(layer.name + ": locked, skipped.");
                    return;
                }
                tr = layer.property(u.MATCH.transform);
                scale = tr.property(u.MATCH.scale);
                anchor = tr.property(u.MATCH.anchor);
                if (scale.numKeys > 0 || anchor.numKeys > 0) {
                    ctx.warn(layer.name + ": scale or anchor point is keyframed, skipped.");
                    return;
                }
                rect = layer.sourceRectAtTime(comp.time, false);
                if (!rect || rect.width <= 0 || rect.height <= 0) {
                    ctx.warn(layer.name + ": empty at the playhead, skipped.");
                    return;
                }
                s = fill ? Math.max(W / rect.width, H / rect.height) : Math.min(W / rect.width, H / rect.height);
                s = s * 100;
                cur = scale.value;
                scale.setValue(layer.threeDLayer ? [s * sign(cur[0]), s * sign(cur[1]), cur[2]] : [s * sign(cur[0]), s * sign(cur[1])]);
                anchor.setValue(layer.threeDLayer ?
                    [rect.left + rect.width / 2, rect.top + rect.height / 2, anchor.value[2]] :
                    [rect.left + rect.width / 2, rect.top + rect.height / 2]);
                if (layer.parent) {
                    ctx.warn(layer.name + ": parented, so it was scaled but not re-centred.");
                } else {
                    setPosition(layer, comp.width / 2, comp.height / 2, ctx);
                }
                done++;
            });
            return { resized: done };
        }
    });

    function sign(v) {
        return v < 0 ? -1 : 1;
    }

    function setPosition(layer, x, y, ctx) {
        var tr = layer.property(u.MATCH.transform);
        var pos = tr.property(u.MATCH.position);
        var px, py, cur;
        if (pos.dimensionsSeparated) {
            px = tr.property(u.MATCH.positionX);
            py = tr.property(u.MATCH.positionY);
            if (px.numKeys > 0 || py.numKeys > 0) {
                ctx.warn(layer.name + ": position is keyframed, not re-centred.");
                return;
            }
            px.setValue(x);
            py.setValue(y);
            return;
        }
        if (pos.numKeys > 0) {
            ctx.warn(layer.name + ": position is keyframed, not re-centred.");
            return;
        }
        cur = pos.value;
        pos.setValue(cur.length > 2 ? [x, y, cur[2]] : [x, y]);
    }

    M.register("project.reframeComp", {
        undo: "Reframe Comp",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var W = Math.round(args.width);
            var H = Math.round(args.height);
            var dx, dy, i, layer, moved, wasLocked;
            if (!(W >= 4 && W <= 30000 && H >= 4 && H <= 30000)) {
                throw u.userError("Width and height must be between 4 and 30000 px.", "bad_size");
            }
            dx = (W - comp.width) / 2;
            dy = (H - comp.height) / 2;
            comp.width = W;
            comp.height = H;
            moved = 0;
            for (i = 1; i <= comp.numLayers; i++) {
                layer = comp.layer(i);
                if (layer.parent) {
                    continue;
                }
                wasLocked = layer.locked;
                if (wasLocked) {
                    layer.locked = false;
                }
                try {
                    u.offsetPosition(layer, dx, dy);
                    moved++;
                } catch (e) {
                    ctx.warn(layer.name + ": could not be re-centred (" + e.message + ").");
                }
                if (wasLocked) {
                    layer.locked = true;
                }
            }
            return { width: W, height: H, moved: moved };
        }
    });

    // --- Project bin ---------------------------------------------------------

    var BIN_FOLDERS = ["Comps", "Precomps", "Footage", "Audio", "Images", "Solids"];

    function binFolderFor(item) {
        var main;
        if (item instanceof CompItem) {
            return item.usedIn && item.usedIn.length > 0 ? "Precomps" : "Comps";
        }
        if (item instanceof FootageItem) {
            main = item.mainSource;
            if (main instanceof SolidSource) {
                return "Solids";
            }
            if (main && main.isStill) {
                return "Images";
            }
            if (!item.hasVideo && item.hasAudio) {
                return "Audio";
            }
            return "Footage";
        }
        return null;
    }

    function rootFolder(name) {
        var root = app.project.rootFolder;
        var i, item;
        for (i = 1; i <= root.numItems; i++) {
            item = root.item(i);
            if (item instanceof FolderItem && item.name === name) {
                return item;
            }
        }
        return null;
    }

    /** Moves root-level items into type folders. Never deletes or renames anything. */
    M.register("project.tidyBin", {
        undo: "Tidy Project Bin",
        fn: function () {
            var root = app.project.rootFolder;
            var folders = {};
            var toMove = [];
            var counts = {};
            var i, item, target, name, moved;

            for (i = 1; i <= root.numItems; i++) {
                item = root.item(i);
                if (item instanceof FolderItem) {
                    continue;
                }
                target = binFolderFor(item);
                if (target) {
                    toMove.push({ item: item, folder: target });
                }
            }
            moved = 0;
            for (i = 0; i < toMove.length; i++) {
                name = toMove[i].folder;
                if (!folders[name]) {
                    folders[name] = rootFolder(name) || app.project.items.addFolder(name);
                }
                toMove[i].item.parentFolder = folders[name];
                counts[name] = (counts[name] || 0) + 1;
                moved++;
            }
            return { moved: moved, counts: counts, folders: BIN_FOLDERS };
        }
    });

    M.register("project.purge", {
        fn: function () {
            app.purge(PurgeTarget.ALL_CACHES);
            return { purged: true };
        }
    });

    M.project = { binFolderFor: binFolderFor };
})(MES);
